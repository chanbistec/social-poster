#!/usr/bin/env python3
"""Render a branded reel/short video from scenes + narration.

Accepts a JSON config via --config and produces a final MP4 via --output.
Uses Pillow for image overlays and FFmpeg for video composition.
"""
import argparse
import json
import math
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# ---------------------------------------------------------------------------
# Ken Burns filter templates (zoompan patterns)
# ---------------------------------------------------------------------------
KEN_BURNS_FILTERS = {
    "zoom_in": (
        "scale=1200:2133,zoompan="
        "z='1+0.04*on/30':"
        "x='iw/2-(iw/zoom/2)':"
        "y='ih/2-(ih/zoom/2)':"
        "d={frames}:s={w}x{h}:fps={fps}"
    ),
    "slow_pan": (
        "scale=1200:2133,zoompan="
        "z='1.08':"
        "x='60+30*sin(on/30*0.3)':"
        "y='ih/2-(ih/zoom/2)':"
        "d={frames}:s={w}x{h}:fps={fps}"
    ),
    "zoom_out": (
        "scale=1200:2133,zoompan="
        "z='1.15-0.05*on/30':"
        "x='iw/2-(iw/zoom/2)':"
        "y='ih/2-(ih/zoom/2)':"
        "d={frames}:s={w}x{h}:fps={fps}"
    ),
    "slow_zoom_in": (
        "scale=1200:2133,zoompan="
        "z='1+0.02*on/30':"
        "x='iw/2-(iw/zoom/2)':"
        "y='ih/2-(ih/zoom/2)':"
        "d={frames}:s={w}x{h}:fps={fps}"
    ),
}


def expand(p: str) -> str:
    """Expand ~ and env vars in a path string."""
    return os.path.expanduser(os.path.expandvars(p))


# ---------------------------------------------------------------------------
# Pillow helpers
# ---------------------------------------------------------------------------

def make_circular_logo(logo_path: str, size: int) -> Image.Image:
    """Return a circular-cropped RGBA logo of the given size."""
    logo = Image.open(expand(logo_path)).convert("RGBA").resize((size, size), Image.LANCZOS)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size, size), fill=255)
    logo.putalpha(mask)
    return logo


def apply_gradient_overlay(img: Image.Image, height_fraction: float = 0.35) -> Image.Image:
    """Apply a dark gradient at the bottom of an image (for text legibility)."""
    w, h = img.size
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    grad_h = int(h * height_fraction)
    for i in range(grad_h):
        alpha = int(180 * (i / grad_h))
        draw.rectangle([(0, h - grad_h + i), (w, h - grad_h + i + 1)], fill=(0, 0, 0, alpha))
    return Image.alpha_composite(img.convert("RGBA"), overlay)


def brand_scene(
    scene_path: str,
    logo: Image.Image,
    watermark_text: str,
    font: ImageFont.FreeTypeFont | None,
    width: int,
    height: int,
) -> Image.Image:
    """Open a scene image, resize, apply gradient + logo + watermark."""
    img = Image.open(scene_path).convert("RGBA").resize((width, height), Image.LANCZOS)
    img = apply_gradient_overlay(img)

    # Logo top-right (with 20px padding)
    logo_x = width - logo.size[0] - 20
    logo_y = 20
    img.paste(logo, (logo_x, logo_y), logo)

    # Watermark bottom-center
    draw = ImageDraw.Draw(img)
    if font is None:
        font = ImageDraw.getfont()
    bbox = draw.textbbox((0, 0), watermark_text, font=font)
    tw = bbox[2] - bbox[0]
    tx = (width - tw) // 2
    ty = height - 60
    # Shadow
    draw.text((tx + 1, ty + 1), watermark_text, fill=(0, 0, 0, 160), font=font)
    draw.text((tx, ty), watermark_text, fill=(255, 255, 255, 220), font=font)

    return img


# ---------------------------------------------------------------------------
# FFmpeg helpers
# ---------------------------------------------------------------------------

def render_scene_clip(
    ffmpeg: str,
    image_path: str,
    output_path: str,
    duration: float,
    kb_filter: str,
    fps: int,
    width: int,
    height: int,
) -> None:
    """Render a single scene image into a Ken Burns video clip."""
    frames = int(math.ceil(duration * fps))
    vf = kb_filter.format(frames=frames, w=width, h=height, fps=fps)
    cmd = [
        ffmpeg, "-y",
        "-loop", "1",
        "-i", image_path,
        "-vf", vf,
        "-t", f"{duration:.3f}",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-r", str(fps),
        "-an",
        output_path,
    ]
    subprocess.run(cmd, check=True, capture_output=True)


def compose_final(
    ffmpeg: str,
    clip_paths: list[str],
    narration_path: str | None,
    bgm_path: str | None,
    output_path: str,
    voice_delay: float,
    bgm_volume: float,
    voice_volume: float,
    bgm_fade_in: float,
    bgm_fade_out: float,
    total_duration: float,
) -> None:
    """Concat clips, mix narration + BGM, output final MP4."""
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as f:
        for cp in clip_paths:
            f.write(f"file '{cp}'\n")
        concat_list = f.name

    try:
        # Build command
        inputs = [ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", concat_list]
        filter_parts: list[str] = []
        audio_inputs: list[str] = []
        stream_idx = 1  # 0 = concat video

        # Narration
        if narration_path and os.path.isfile(expand(narration_path)):
            inputs += ["-i", expand(narration_path)]
            filter_parts.append(
                f"[{stream_idx}:a]adelay={int(voice_delay * 1000)}|{int(voice_delay * 1000)},"
                f"volume={voice_volume}[voice]"
            )
            audio_inputs.append("[voice]")
            stream_idx += 1

        # BGM
        if bgm_path and os.path.isfile(expand(bgm_path)):
            inputs += ["-i", expand(bgm_path)]
            filter_parts.append(
                f"[{stream_idx}:a]volume={bgm_volume},"
                f"afade=t=in:st=0:d={bgm_fade_in},"
                f"afade=t=out:st={max(0, total_duration - bgm_fade_out)}:d={bgm_fade_out}[bgm]"
            )
            audio_inputs.append("[bgm]")
            stream_idx += 1

        # Mix audio streams
        if len(audio_inputs) > 1:
            mix = "".join(audio_inputs) + f"amix=inputs={len(audio_inputs)}:duration=first[aout]"
            filter_parts.append(mix)
            audio_map = ["-map", "0:v", "-map", "[aout]"]
        elif len(audio_inputs) == 1:
            tag = audio_inputs[0]
            audio_map = ["-map", "0:v", "-map", tag]
        else:
            audio_map = ["-map", "0:v"]

        filter_complex = ";".join(filter_parts) if filter_parts else None

        cmd = inputs
        if filter_complex:
            cmd += ["-filter_complex", filter_complex]
        cmd += audio_map
        cmd += [
            "-c:v", "libx264",
            "-c:a", "aac",
            "-pix_fmt", "yuv420p",
            "-t", f"{total_duration:.3f}",
            output_path,
        ]
        subprocess.run(cmd, check=True, capture_output=True)
    finally:
        os.unlink(concat_list)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Render a branded reel/short video.")
    parser.add_argument("--config", required=True, help="JSON config file path")
    parser.add_argument("--output", required=True, help="Output MP4 path")
    args = parser.parse_args()

    with open(args.config) as f:
        config = json.load(f)

    scenes: list[str] = config["scenes"]
    narration = config.get("narration", {})
    branding = config.get("branding", {})
    timing = config.get("timing", {})
    audio = config.get("audio", {})
    kb_names: list[str] = config.get("kenBurns", ["zoom_in", "slow_pan", "zoom_out"])

    ffmpeg = expand(config.get("ffmpegPath", "ffmpeg"))
    fps = config.get("fps", 30)
    width = config.get("width", 1080)
    height = config.get("height", 1920)

    intro_dur = timing.get("introDuration", 2.0)
    outro_dur = timing.get("outroDuration", 3.0)
    voice_delay = timing.get("voiceDelay", 2.0)
    voice_buffer = timing.get("voiceBuffer", 0.5)
    scene_dist: list[float] = timing.get("sceneDistribution", [])

    narration_dur = narration.get("duration", 0)
    narration_wav = narration.get("wavPath")

    bgm_path = audio.get("bgmPath")
    bgm_volume = audio.get("bgmVolume", 0.20)
    voice_volume = audio.get("voiceVolume", 1.0)
    bgm_fade_in = audio.get("bgmFadeIn", 1.5)
    bgm_fade_out = audio.get("bgmFadeOut", 2.0)

    logo_path = branding.get("logoPath")
    logo_size = branding.get("logoSize", 55)
    watermark_text = branding.get("watermarkText", "qualitylife.lk")
    font_path = branding.get("fontPath")
    intro_frame = branding.get("introFrame")
    outro_frame = branding.get("outroFrame")

    # Load font
    font: ImageFont.FreeTypeFont | None = None
    if font_path:
        fp = expand(font_path)
        if os.path.isfile(fp):
            font = ImageFont.truetype(fp, 22)
    if font is None:
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 22)
        except OSError:
            font = None  # fallback to default

    # Circular logo
    logo_img = None
    if logo_path and os.path.isfile(expand(logo_path)):
        logo_img = make_circular_logo(logo_path, logo_size)

    # ---- Compute scene durations ----
    # Content duration = narration_dur + voice_buffer (time scenes play while voice speaks)
    content_dur = narration_dur + voice_buffer if narration_dur > 0 else 5.0 * len(scenes)

    if scene_dist and len(scene_dist) == len(scenes):
        scene_durations = [content_dur * d for d in scene_dist]
    else:
        per_scene = content_dur / max(len(scenes), 1)
        scene_durations = [per_scene] * len(scenes)

    total_duration = intro_dur + sum(scene_durations) + outro_dur

    # ---- Brand scene images ----
    tmpdir = tempfile.mkdtemp(prefix="video_render_")
    branded_paths: list[str] = []
    for i, sp in enumerate(scenes):
        img = brand_scene(
            expand(sp),
            logo_img,
            watermark_text,
            font,
            width,
            height,
        ) if logo_img else Image.open(expand(sp)).convert("RGBA").resize((width, height), Image.LANCZOS)
        out_path = os.path.join(tmpdir, f"scene_{i:03d}.png")
        img.convert("RGB").save(out_path)
        branded_paths.append(out_path)

    # ---- Render clips ----
    clip_paths: list[str] = []

    # Intro clip
    if intro_frame and os.path.isfile(expand(intro_frame)):
        intro_clip = os.path.join(tmpdir, "clip_intro.mp4")
        render_scene_clip(ffmpeg, expand(intro_frame), intro_clip, intro_dur,
                          KEN_BURNS_FILTERS["zoom_out"], fps, width, height)
        clip_paths.append(intro_clip)

    # Content scene clips
    for i, (bp, dur) in enumerate(zip(branded_paths, scene_durations)):
        kb_name = kb_names[i % len(kb_names)]
        kb_filter = KEN_BURNS_FILTERS.get(kb_name, KEN_BURNS_FILTERS["zoom_in"])
        clip_path = os.path.join(tmpdir, f"clip_scene_{i:03d}.mp4")
        render_scene_clip(ffmpeg, bp, clip_path, dur, kb_filter, fps, width, height)
        clip_paths.append(clip_path)

    # Outro clip
    if outro_frame and os.path.isfile(expand(outro_frame)):
        outro_clip = os.path.join(tmpdir, "clip_outro.mp4")
        render_scene_clip(ffmpeg, expand(outro_frame), outro_clip, outro_dur,
                          KEN_BURNS_FILTERS["slow_zoom_in"], fps, width, height)
        clip_paths.append(outro_clip)

    # ---- Final composition ----
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)

    compose_final(
        ffmpeg=ffmpeg,
        clip_paths=clip_paths,
        narration_path=narration_wav,
        bgm_path=bgm_path,
        output_path=args.output,
        voice_delay=voice_delay,
        bgm_volume=bgm_volume,
        voice_volume=voice_volume,
        bgm_fade_in=bgm_fade_in,
        bgm_fade_out=bgm_fade_out,
        total_duration=total_duration,
    )

    # ---- Output result as JSON to stdout ----
    result = {
        "videoPath": os.path.abspath(args.output),
        "duration": round(total_duration, 3),
        "scenes": len(scenes),
        "tmpDir": tmpdir,
    }
    print(json.dumps(result))


if __name__ == "__main__":
    main()
