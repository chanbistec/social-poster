# Proposal: Content Generation Pipeline

## Problem
The "Create Post" page currently requires manual text/media input. What we really need is a **configurable content generation pipeline** — the same flow we built for Area6 but parametric and multi-tenant.

## Current Area6 Pipeline (3 platforms)

### YouTube Shorts (`shorts_gen.py`)
1. Read tip JSON → `{id, title, highlight, category, tip, hashtags}`
2. Generate TTS narration (Piper `en_US-lessac-medium`)
3. Use category background image (Imagen-generated, stored in `branding/backgrounds/`)
4. Render branded text overlays with Pillow (logo, title, category pill, watermark)
5. Compose 9:16 video with FFmpeg (Ken Burns on background + audio)
6. Upload via YouTube Data API (`scripts/youtube-upload.js`)

### Instagram/Facebook Reels (`reel_gen.py`)
1. Read tip JSON
2. Generate TTS narration (Piper, 15% slower via `length_scale=1.15`)
3. Generate 3 scene prompts with Gemini
4. Generate 3 AI scene images with Imagen 4 Fast
5. Render intro frame (2s) + 3 content scenes (duration from narration) + outro (3s)
6. Apply Ken Burns motion, logo overlay, watermark on content scenes
7. Mix lo-fi BGM + voice narration with delays/fades
8. Upload: Instagram Reels via Meta Graph API, Facebook video via Graph API

### Social Square Posts (manual, Pillow-based)
1. Generate 1:1 AI image with Imagen 4
2. Overlay: darken, title text, subtitle, accent line, circular logo, watermark
3. Post: Instagram photo via container API, Facebook photo via page API

## Proposed Solution: Pipeline Templates

Add a **Pipeline** concept to Social Poster:

```
Pipeline Template
  ├── name: "Health Tip Reel"
  ├── platform_targets: [youtube, instagram, facebook]
  ├── steps:
  │   ├── 1. generate_narration (TTS config)
  │   ├── 2. generate_scenes (Imagen/Gemini config)
  │   ├── 3. render_video (FFmpeg config, branding config)
  │   └── 4. publish (per-platform config)
  └── params:
      ├── tip_json: {title, tip, category, hashtags}
      ├── branding: {logo, colors, fonts, intro/outro frames}
      └── tts: {engine, model, speed}
```

Each tenant can have **pipeline templates** with their own branding, and creating a post means:
1. Pick a pipeline template
2. Fill in the content params (or AI-generate them)
3. Preview → Approve → Generate → Publish

## Scope (MVP)
- Pipeline template CRUD (DB + API + UI)
- Step definitions: narration, image_gen, video_gen, social_image
- Per-tenant branding assets (logo, backgrounds, intro/outro frames, fonts, colors)
- Post creation from pipeline: select template → fill params → generate → preview → approve → publish
- Migrate Area6's configs into the first pipeline template

## Out of Scope (Later)
- Visual pipeline builder (drag & drop)
- Custom step plugins
- A/B testing variants
- Analytics integration
