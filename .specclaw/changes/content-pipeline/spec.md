# Spec: Content Generation Pipeline

## Data Model

### pipeline_templates table
```sql
CREATE TABLE pipeline_templates (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  name        TEXT NOT NULL,
  description TEXT,
  type        TEXT NOT NULL,  -- 'reel', 'short', 'social_image', 'custom'
  platforms   TEXT NOT NULL,  -- JSON array: ["youtube","instagram","facebook"]
  steps       TEXT NOT NULL,  -- JSON array of step configs
  branding    TEXT NOT NULL,  -- JSON: logos, colors, fonts, intro/outro, watermark
  tts_config  TEXT,           -- JSON: engine, model, speed, voice
  imagen_config TEXT,         -- JSON: model, aspect_ratio, prompt_suffix
  video_config TEXT,          -- JSON: format, ken_burns, timing, audio
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### pipeline_runs table
```sql
CREATE TABLE pipeline_runs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id  INTEGER NOT NULL REFERENCES pipeline_templates(id),
  post_id      INTEGER REFERENCES posts(id),
  status       TEXT NOT NULL DEFAULT 'pending',  -- pending, generating, preview, approved, publishing, published, failed
  input_params TEXT NOT NULL,  -- JSON: tip content, overrides
  step_results TEXT,           -- JSON: per-step output (paths, durations, errors)
  output_paths TEXT,           -- JSON: generated media files
  error        TEXT,
  started_at   TEXT,
  completed_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### tenant_branding table
```sql
CREATE TABLE tenant_branding (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) UNIQUE,
  logo_path   TEXT,
  colors      TEXT NOT NULL DEFAULT '{}',  -- JSON: {primary, secondary, accent, dark, white}
  fonts       TEXT NOT NULL DEFAULT '{}',  -- JSON: {heading, body, paths}
  intro_frame TEXT,  -- path to intro image/video
  outro_frame TEXT,  -- path to outro image/video
  watermark   TEXT,  -- JSON: {text, position, font_size}
  bgm_path    TEXT,
  backgrounds TEXT NOT NULL DEFAULT '{}',  -- JSON: {category: path} map
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

## API Endpoints

### Pipeline Templates
- `GET    /api/pipelines` — list templates (filter by tenant_id)
- `GET    /api/pipelines/:id` — get template + branding
- `POST   /api/pipelines` — create template
- `PUT    /api/pipelines/:id` — update template
- `DELETE /api/pipelines/:id` — delete template

### Pipeline Runs
- `POST   /api/pipelines/:id/run` — start a generation run (input_params in body)
- `GET    /api/pipeline-runs/:id` — get run status + results
- `POST   /api/pipeline-runs/:id/approve` — approve generated content
- `POST   /api/pipeline-runs/:id/publish` — publish approved content

### Tenant Branding
- `GET    /api/tenants/:id/branding` — get branding config
- `PUT    /api/tenants/:id/branding` — update branding config
- `POST   /api/tenants/:id/branding/upload` — upload branding assets (logo, backgrounds, intro/outro)

## Pipeline Steps (built-in)

### 1. generate_narration
- Input: text, tts_config
- Process: Piper TTS with configurable model + speed
- Output: WAV path, duration

### 2. generate_scenes
- Input: tip text, scene_count, imagen_config
- Process: Gemini prompt → Imagen 4 generation
- Output: Array of image paths

### 3. render_video (reel/short)
- Input: narration, scenes, branding, video_config
- Process: Pillow overlays + FFmpeg composition
- Output: MP4 path

### 4. render_social_image
- Input: tip text, imagen_config, branding
- Process: Imagen background + Pillow overlays
- Output: PNG/JPG path

## UI Pages

### /pipelines — Pipeline list
- Cards showing template name, type, platforms, last run
- "+ Create Pipeline" button

### /pipelines/new — Create pipeline
- Step-by-step wizard:
  1. Name + type (reel/short/social_image)
  2. Select platforms
  3. Configure steps (TTS, Imagen, video)
  4. Branding (select from tenant branding or customize)

### /pipelines/:id — Pipeline detail
- Template config overview
- "Run Pipeline" button → opens input form
- Run history table

### /pipelines/:id/run — Run pipeline
- Input form: title, tip text, category, hashtags
- Or: "AI Generate Content" button (Gemini generates tip)
- Preview generated content before publishing
- Approve → Publish flow

### /tenants/:id — Add branding tab
- Logo upload
- Color picker (primary, accent)
- Background images per category
- Intro/outro frame upload
- BGM upload

## Acceptance Criteria
1. Can create a pipeline template matching Area6's reel config
2. Can run a pipeline: input tip → generates narration + scenes + video → preview
3. Can approve and publish to all 3 platforms from the run
4. Pipeline configs are tenant-scoped
5. Branding assets are uploadable per tenant
