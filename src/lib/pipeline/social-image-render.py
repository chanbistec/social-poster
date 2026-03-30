#!/usr/bin/env python3
"""Render a branded square social post image using Pillow.

Takes a background image, branding config JSON, title/subtitle text,
and produces a 1080x1080 branded social post image.
"""
import argparse
import json
import os
import sys
import textwrap
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("ERROR: Pillow is required. Install with: pip install Pillow", file=sys.stderr)
    sys.exit(1)


def find_font(preferred: str, size: int) -> ImageFont.FreeTypeFont:
    """Try preferred font path, then common fallbacks."""
    candidates = [
        os.path.expanduser(preferred),
        os.path.expanduser("~/.local/share/fonts/NotoSans-Bold.ttf"),
        "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
    ]
    for path in candidates:
        if os.path.isfile(path):
            return ImageFont.truetype(path, size)
    # Last resort: default bitmap font
    print(f"WARNING: No TrueType font found, using default bitmap font", file=sys.stderr)
    return ImageFont.load_default()


def wrap_text(text: str, font: ImageFont.FreeTypeFont, max_width: int, draw: ImageDraw.Draw) -> list[str]:
    """Word-wrap text to fit within max_width pixels."""
    words = text.split()
    lines: list[str] = []
    current_line = ""
    for word in words:
        test = f"{current_line} {word}".strip()
        bbox = draw.textbbox((0, 0), test, font=font)
        if bbox[2] - bbox[0] <= max_width:
            current_line = test
        else:
            if current_line:
                lines.append(current_line)
            current_line = word
    if current_line:
        lines.append(current_line)
    return lines or [""]


def make_circular(img: Image.Image) -> Image.Image:
    """Apply circular mask to an image."""
    size = img.size
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse([0, 0, size[0] - 1, size[1] - 1], fill=255)
    output = Image.new("RGBA", size, (0, 0, 0, 0))
    output.paste(img, mask=mask)
    return output


def render(args) -> dict:
    """Main render logic. Returns metadata dict."""
    config = json.load(open(args.config))
    visuals = config.get("visuals", {})
    fmt = config.get("format", {"width": 1080, "height": 1080, "quality": 95})

    width = fmt.get("width", 1080)
    height = fmt.get("height", 1080)
    quality = fmt.get("quality", 95)

    # --- 1. Open/resize background ---
    bg = Image.open(args.background).convert("RGBA")
    bg = bg.resize((width, height), Image.LANCZOS)

    # --- 2. Dark overlay ---
    overlay_color = tuple(visuals.get("darken_overlay", [0, 0, 0, 60]))
    overlay = Image.new("RGBA", (width, height), overlay_color)
    bg = Image.alpha_composite(bg, overlay)

    draw = ImageDraw.Draw(bg)

    # --- 3. Load fonts ---
    font_path = visuals.get("font", "~/.local/share/fonts/NotoSans-Bold.ttf")
    title_cfg = visuals.get("title", {})
    subtitle_cfg = visuals.get("subtitle", {})
    watermark_cfg = visuals.get("watermark", {})

    title_font = find_font(font_path, title_cfg.get("font_size", 54))
    subtitle_font = find_font(font_path, subtitle_cfg.get("font_size", 26))
    watermark_font = find_font(font_path, watermark_cfg.get("font_size", 20))

    colors = visuals.get("colors", {})
    white = colors.get("white", "#FFFFFF")
    orange = colors.get("orange", "#F97316")

    # --- 4. Draw title (centered, with shadow) ---
    title_y = title_cfg.get("y_start", 200)
    title_line_height = title_cfg.get("line_height", 68)
    title_shadow = title_cfg.get("shadow_offset", 2)
    title_centered = title_cfg.get("centered", True)

    title_lines = wrap_text(args.title, title_font, width - 100, draw)
    for line in title_lines:
        bbox = draw.textbbox((0, 0), line, font=title_font)
        tw = bbox[2] - bbox[0]
        if title_centered:
            x = (width - tw) // 2
        else:
            x = 52
        # Shadow
        if title_shadow:
            draw.text((x + title_shadow, title_y + title_shadow), line,
                       font=title_font, fill=(0, 0, 0, 180))
        # Main text
        draw.text((x, title_y), line, font=title_font, fill=white)
        title_y += title_line_height

    # --- 5. Draw accent line ---
    accent = visuals.get("accent_line", {})
    if accent:
        accent_y = accent.get("y", 870)
        ax1 = accent.get("x_start", 52)
        ax2 = accent.get("x_end", 200)
        ah = accent.get("height", 4)
        accent_color = accent.get("color", orange)
        draw.rectangle([ax1, accent_y, ax2, accent_y + ah], fill=accent_color)

    # --- 6. Draw subtitle ---
    if args.subtitle:
        sub_y = subtitle_cfg.get("y_start", 880)
        sub_x = subtitle_cfg.get("x", 52)
        sub_line_height = subtitle_cfg.get("line_height", 36)
        sub_shadow = subtitle_cfg.get("shadow_offset", 1)

        sub_lines = wrap_text(args.subtitle, subtitle_font, width - sub_x - 200, draw)
        for line in sub_lines:
            if sub_shadow:
                draw.text((sub_x + sub_shadow, sub_y + sub_shadow), line,
                           font=subtitle_font, fill=(0, 0, 0, 150))
            draw.text((sub_x, sub_y), line, font=subtitle_font, fill=white)
            sub_y += sub_line_height

    # --- 7. Paste circular logo ---
    logo_cfg = visuals.get("logo", {})
    logo_path = args.logo if args.logo else logo_cfg.get("path", "")

    # Resolve relative logo path against config file directory
    if logo_path and not os.path.isabs(logo_path):
        config_dir = os.path.dirname(os.path.abspath(args.config))
        # Walk up to find the branding root (social-post-config is in branding/reel-assets/)
        # Logo path is relative to the project root containing 'branding/'
        candidate = os.path.join(config_dir, logo_path)
        if os.path.isfile(candidate):
            logo_path = candidate
        else:
            # Try going up directories
            for parent in [config_dir, os.path.dirname(config_dir), os.path.dirname(os.path.dirname(config_dir))]:
                candidate = os.path.join(parent, logo_path)
                if os.path.isfile(candidate):
                    logo_path = candidate
                    break

    if logo_path and os.path.isfile(logo_path):
        logo_size = logo_cfg.get("size", 80)
        logo_pos = logo_cfg.get("position", [960, 950])
        logo_img = Image.open(logo_path).convert("RGBA")
        logo_img = logo_img.resize((logo_size, logo_size), Image.LANCZOS)

        if logo_cfg.get("circular", True):
            logo_img = make_circular(logo_img)

        # Position is center of logo
        paste_x = logo_pos[0] - logo_size // 2
        paste_y = logo_pos[1] - logo_size // 2
        bg.paste(logo_img, (paste_x, paste_y), logo_img)

    # --- 8. Watermark text ---
    wm_text = watermark_cfg.get("text", "")
    if wm_text:
        wm_y = watermark_cfg.get("y", 1040)
        wm_color = watermark_cfg.get("color", [255, 255, 255, 150])
        wm_color_tuple = tuple(wm_color) if isinstance(wm_color, list) else wm_color

        bbox = draw.textbbox((0, 0), wm_text, font=watermark_font)
        wm_tw = bbox[2] - bbox[0]

        if watermark_cfg.get("centered_under_logo", False) and logo_cfg:
            logo_pos = logo_cfg.get("position", [960, 950])
            wm_x = logo_pos[0] - wm_tw // 2
        else:
            wm_x = (width - wm_tw) // 2

        draw.text((wm_x, wm_y), wm_text, font=watermark_font, fill=wm_color_tuple)

    # --- Save ---
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    # Convert to RGB for JPEG output, keep RGBA for PNG
    if args.output.lower().endswith(".png"):
        bg.save(args.output, "PNG")
    else:
        bg_rgb = bg.convert("RGB")
        bg_rgb.save(args.output, "JPEG", quality=quality)

    return {
        "imagePath": os.path.abspath(args.output),
        "width": width,
        "height": height,
    }


def main():
    parser = argparse.ArgumentParser(description="Render branded social post image")
    parser.add_argument("--background", required=True, help="Background image path")
    parser.add_argument("--config", required=True, help="Branding config JSON path")
    parser.add_argument("--title", required=True, help="Title text")
    parser.add_argument("--subtitle", default="", help="Subtitle text")
    parser.add_argument("--logo", default="", help="Override logo path")
    parser.add_argument("--output", required=True, help="Output image path")
    args = parser.parse_args()

    result = render(args)
    # Print result as JSON to stdout for the Node.js caller
    print(json.dumps(result))


if __name__ == "__main__":
    main()
