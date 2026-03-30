#!/usr/bin/env python3
"""Render a branded reel/short video from scenes + narration.

Matches the original reel_gen.py approach:
1. Generate transparent text overlay PNGs (static logo, watermark, scene text)
2. Apply Ken Burns to RAW scene images
3. Overlay static text on top of Ken Burns clips
4. Encode intro + content scenes + outro
5. Mix BGM + narration separately
6. Mux video + audio into final MP4

This means text/logo stay STATIC while the background moves.
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
# Ken Burns filter templates
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


def expand(p):
    """Expand ~ and env vars in a path string."""
    if not p:
        return p
    return os.path.expanduser(os.path.expandvars(str(p)))


def load_font(path, size):
    try:
        return ImageFont.truetype(expand(path), size)
    except (OSError, IOError):
        # Fallbacks
        for f in [
            os.path.expanduser("~/.local/share/fonts/NotoSans-Bold.ttf"),
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        ]:
            if os.path.isfile(f):
                return ImageFont.truetype(f, size)
        return ImageFont.load_default()


def shadow_text(draw, pos, text, font, fill, offset=3):
    x, y = pos
    for dx, dy in [(offset, offset), (offset, 0), (0, offset), (-1, offset)]:
        draw.text((x + dx, y + dy), text, font=font, fill=(0, 0, 0, 220))
    draw.text(pos, text, font=font, fill=fill)


def center_x(draw, text, font, width=1080):
    bb = draw.textbbox((0, 0), text, font=font)
    return (width - (bb[2] - bb[0])) // 2


def make_circular_logo(logo_path, size):
    logo = Image.open(expand(logo_path)).convert("RGBA").resize((size, size), Image.LANCZOS)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size, size), fill=255)
    logo.putalpha(mask)
    return logo, mask


# ---------------------------------------------------------------------------
# Generate static text overlay PNGs (transparent)
# ---------------------------------------------------------------------------
def generate_text_overlays(tip_title, tip_text, config, tmpdir):
    """Create transparent PNG overlays with static text for each scene."""
    branding = config.get("branding", {})
    font_path = branding.get("fontPath", "")
    width = config.get("width", 1080)
    height = config.get("height", 1920)

    ORANGE = (249, 115, 22)  # #F97316
    WHITE = (255, 255, 255)

    # Logo
    logo_path = branding.get("logoPath")
    logo_size = 80
    # Position logo in safe zone — avoid IG camera icon (top-right) and YT UI
    # Right side, well below status bar + IG icons (~200px from top, 100px from right)
    logo_pos = (width - logo_size - 100, 200)

    logo_img, logo_mask = None, None
    if logo_path and os.path.isfile(expand(logo_path)):
        logo_img, logo_mask = make_circular_logo(logo_path, logo_size)

    wm_text = branding.get("watermarkText", "qualitylife.lk")
    # Keep watermark above IG/YT bottom UI (safe zone ends ~1700px on 1920h)
    wm_y = 1680
    fnt_wm = load_font(font_path, 18)

    # Split tip text into 3 parts
    words = tip_text.split()
    total = len(words)
    s1 = words[:total // 3]
    s2 = words[total // 3:2 * total // 3]
    s3 = words[2 * total // 3:]

    # Safe zone for text: y=250 to y=1600 (avoids IG/YT UI at top and bottom)
    scene_texts = [
        # Scene 1: Hook — upper-center area
        [
            ("DID YOU KNOW?", load_font(font_path, 38), ORANGE, 350),
            (tip_title.upper(), load_font(font_path, 54), WHITE, 420),
        ],
        # Scene 2: Fact — center area
        [
            (" ".join(s2[:4]), load_font(font_path, 44), WHITE, 800),
            (" ".join(s2[4:8]) if len(s2) > 4 else "", load_font(font_path, 52), ORANGE, 870),
            (" ".join(s2[8:]) if len(s2) > 8 else "", load_font(font_path, 44), WHITE, 940),
        ],
        # Scene 3: CTA — center area
        [
            (" ".join(s3[:5]), load_font(font_path, 48), WHITE, 750),
            (" ".join(s3[5:]) if len(s3) > 5 else "", load_font(font_path, 56), ORANGE, 830),
        ],
    ]

    overlays = []
    for i, texts in enumerate(scene_texts):
        img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)

        # Dark vignette overlay for text legibility — top and bottom gradients
        # Bottom gradient
        grad_h = int(height * 0.40)
        for j in range(grad_h):
            alpha = int(140 * (j / grad_h))
            d.rectangle([(0, height - grad_h + j), (width, height - grad_h + j + 1)],
                        fill=(0, 0, 0, alpha))
        # Top gradient (lighter)
        top_h = int(height * 0.25)
        for j in range(top_h):
            alpha = int(100 * (1 - j / top_h))
            d.rectangle([(0, j), (width, j + 1)], fill=(0, 0, 0, alpha))

        # Scene text
        for text, font, color, y in texts:
            if not text.strip():
                continue
            x = center_x(d, text, font, width)
            shadow_text(d, (x, y), text, font, color)

        # Static logo
        if logo_img:
            img.paste(logo_img, logo_pos, logo_mask)

        # Watermark
        bb = d.textbbox((0, 0), wm_text, font=fnt_wm)
        tw = bb[2] - bb[0]
        wm_x = (width - tw) // 2
        for dx, dy in [(1, 1), (1, 0), (0, 1)]:
            d.text((wm_x + dx, wm_y + dy), wm_text, font=fnt_wm, fill=(0, 0, 0, 180))
        d.text((wm_x, wm_y), wm_text, font=fnt_wm, fill=(255, 255, 255, 200))

        path = os.path.join(tmpdir, f"text_{i}.png")
        img.save(path)
        overlays.append(path)

    return overlays


# ---------------------------------------------------------------------------
# FFmpeg helpers
# ---------------------------------------------------------------------------

def encode_scene(ffmpeg, image_path, duration, kb_filter, output_path, fps, width, height):
    """Ken Burns on a raw image → video clip (no text baked in)."""
    frames = int(math.ceil(duration * fps))
    vf = kb_filter.format(frames=frames, w=width, h=height, fps=fps)
    cmd = [
        ffmpeg, "-y",
        "-loop", "1", "-i", image_path,
        "-vf", vf,
        "-t", f"{duration:.3f}",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", str(fps),
        "-an", output_path,
    ]
    subprocess.run(cmd, check=True, capture_output=True)


def overlay_text(ffmpeg, video_path, text_png, output_path):
    """Overlay a transparent text PNG on top of a video clip (static text)."""
    r = subprocess.run([
        ffmpeg, "-y",
        "-i", video_path, "-i", text_png,
        "-filter_complex", "[0:v][1:v]overlay=0:0",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "fast",
        "-an", output_path,
    ], capture_output=True)
    if r.returncode != 0:
        # Fallback: use video without overlay
        import shutil
        shutil.copy2(video_path, output_path)


def mix_audio(ffmpeg, bgm_path, narration_path, total_dur, voice_delay, bgm_volume,
              voice_volume, bgm_fade_in, bgm_fade_out, output_path):
    """Mix BGM + delayed narration into a single audio file."""
    fade_out_start = max(0, total_dur - bgm_fade_out)
    cmd = [
        ffmpeg, "-y",
        "-i", expand(bgm_path), "-i", expand(narration_path),
        "-filter_complex",
        f"[0:a]atrim=0:{total_dur},volume={bgm_volume},"
        f"afade=t=in:st=0:d={bgm_fade_in},"
        f"afade=t=out:st={fade_out_start}:d={bgm_fade_out}[bgm];"
        f"[1:a]adelay={int(voice_delay * 1000)}|{int(voice_delay * 1000)},"
        f"volume={voice_volume}[voice];"
        f"[bgm][voice]amix=inputs=2:weights=1 1:duration=first,"
        f"atrim=0:{total_dur}[aout]",
        "-map", "[aout]", "-c:a", "aac", "-b:a", "128k",
        output_path,
    ]
    subprocess.run(cmd, check=True, capture_output=True)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    with open(args.config) as f:
        config = json.load(f)

    scenes = config["scenes"]
    narration = config.get("narration", {})
    branding = config.get("branding", {})
    timing = config.get("timing", {})
    audio = config.get("audio", {})
    kb_names = config.get("kenBurns", ["zoom_in", "slow_pan", "zoom_out"])
    tip_title = config.get("tipTitle", "Health Tip")
    tip_text = config.get("tipText", "")

    ffmpeg = expand(config.get("ffmpegPath", "ffmpeg"))
    fps = config.get("fps", 30)
    width = config.get("width", 1080)
    height = config.get("height", 1920)

    intro_dur = timing.get("introDuration", 2.0)
    outro_dur = timing.get("outroDuration", 3.0)
    voice_delay = timing.get("voiceDelay", 2.0)
    voice_buffer = timing.get("voiceBuffer", 0.5)
    scene_dist = timing.get("sceneDistribution", [0.3, 0.4, 0.3])

    narration_dur = narration.get("duration", 0)
    narration_wav = narration.get("wavPath")

    bgm_path = audio.get("bgmPath")
    bgm_volume = audio.get("bgmVolume", 0.20)
    voice_volume = audio.get("voiceVolume", 1.0)
    bgm_fade_in = audio.get("bgmFadeIn", 1.5)
    bgm_fade_out = audio.get("bgmFadeOut", 2.0)

    intro_frame = branding.get("introFrame")
    outro_frame = branding.get("outroFrame")

    # Calculate durations
    content_dur = narration_dur + voice_buffer if narration_dur > 0 else 5.0 * len(scenes)
    if scene_dist and len(scene_dist) == len(scenes):
        scene_durs = [round(content_dur * d, 1) for d in scene_dist]
        scene_durs[-1] = round(content_dur - sum(scene_durs[:-1]), 1)
    else:
        per = content_dur / max(len(scenes), 1)
        scene_durs = [round(per, 1)] * len(scenes)

    total_dur = intro_dur + sum(scene_durs) + outro_dur

    tmpdir = tempfile.mkdtemp(prefix="video_render_")

    # --- Step 1: Generate static text overlay PNGs ---
    text_overlays = generate_text_overlays(tip_title, tip_text, config, tmpdir)

    # --- Step 2: Ken Burns on raw scenes, then overlay static text ---
    scene_clips = []
    for i, (scene_path, dur) in enumerate(zip(scenes, scene_durs)):
        kb_name = kb_names[i % len(kb_names)]
        kb_filter = KEN_BURNS_FILTERS.get(kb_name, KEN_BURNS_FILTERS["zoom_in"])

        # Ken Burns on raw image
        clean_clip = os.path.join(tmpdir, f"clean_{i}.mp4")
        encode_scene(ffmpeg, expand(scene_path), dur, kb_filter, clean_clip, fps, width, height)

        # Overlay static text on top
        if i < len(text_overlays):
            final_clip = os.path.join(tmpdir, f"final_{i}.mp4")
            overlay_text(ffmpeg, clean_clip, text_overlays[i], final_clip)
            scene_clips.append(final_clip)
        else:
            scene_clips.append(clean_clip)

    # --- Step 3: Encode intro ---
    intro_clip = None
    if intro_frame and os.path.isfile(expand(intro_frame)):
        intro_clip = os.path.join(tmpdir, "intro.mp4")
        encode_scene(ffmpeg, expand(intro_frame), intro_dur,
                     KEN_BURNS_FILTERS["zoom_out"], intro_clip, fps, width, height)

    # --- Step 4: Encode outro ---
    outro_clip = None
    if outro_frame and os.path.isfile(expand(outro_frame)):
        outro_clip = os.path.join(tmpdir, "outro.mp4")
        encode_scene(ffmpeg, expand(outro_frame), outro_dur,
                     KEN_BURNS_FILTERS["slow_zoom_in"], outro_clip, fps, width, height)

    # --- Step 5: Concat video clips ---
    concat_file = os.path.join(tmpdir, "concat.txt")
    with open(concat_file, "w") as f:
        if intro_clip:
            f.write(f"file '{intro_clip}'\n")
        for clip in scene_clips:
            f.write(f"file '{clip}'\n")
        if outro_clip:
            f.write(f"file '{outro_clip}'\n")

    video_path = os.path.join(tmpdir, "video.mp4")
    subprocess.run([
        ffmpeg, "-y", "-f", "concat", "-safe", "0",
        "-i", concat_file, "-c", "copy", video_path,
    ], check=True, capture_output=True)

    # --- Step 6: Mix audio (BGM + narration) ---
    audio_path = os.path.join(tmpdir, "audio.m4a")
    if bgm_path and narration_wav and os.path.isfile(expand(bgm_path)) and os.path.isfile(expand(narration_wav)):
        mix_audio(ffmpeg, bgm_path, narration_wav, total_dur,
                  voice_delay, bgm_volume, voice_volume, bgm_fade_in, bgm_fade_out,
                  audio_path)
    elif narration_wav and os.path.isfile(expand(narration_wav)):
        # Just narration, no BGM
        subprocess.run([
            ffmpeg, "-y", "-i", expand(narration_wav),
            "-af", f"adelay={int(voice_delay * 1000)}|{int(voice_delay * 1000)}",
            "-c:a", "aac", "-b:a", "128k", audio_path,
        ], check=True, capture_output=True)
    else:
        audio_path = None

    # --- Step 7: Final mux (video + audio) ---
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    if audio_path and os.path.isfile(audio_path):
        subprocess.run([
            ffmpeg, "-y",
            "-i", video_path, "-i", audio_path,
            "-c:v", "copy", "-c:a", "copy",
            "-t", str(total_dur),
            args.output,
        ], check=True, capture_output=True)
    else:
        subprocess.run([
            ffmpeg, "-y", "-i", video_path,
            "-c:v", "copy", "-an",
            "-t", str(total_dur),
            args.output,
        ], check=True, capture_output=True)

    result = {
        "videoPath": os.path.abspath(args.output),
        "duration": round(total_dur, 3),
        "scenes": len(scenes),
        "tmpDir": tmpdir,
    }
    print(json.dumps(result))


if __name__ == "__main__":
    main()
