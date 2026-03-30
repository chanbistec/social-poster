## Tasks

### Wave 1 — Data layer + API (no dependencies)
- [ ] `T1` — DB migration: pipeline_templates, pipeline_runs, tenant_branding tables
  - Files: scripts/migrate.ts, src/lib/types.ts
  - Estimate: small

- [ ] `T2` — Pipeline Templates API (CRUD)
  - Files: src/app/api/pipelines/route.ts, src/app/api/pipelines/[id]/route.ts
  - Estimate: small

- [ ] `T3` — Tenant Branding API + asset upload
  - Files: src/app/api/tenants/[id]/branding/route.ts, src/app/api/tenants/[id]/branding/upload/route.ts
  - Estimate: small

### Wave 2 — Generation engine (depends on Wave 1)
- [ ] `T4` — Pipeline runner: narration step (Piper TTS)
  - Files: src/lib/pipeline/narration.ts
  - Description: Generate TTS audio from text using Piper. Configurable model, speed (length_scale). Returns WAV path + duration.
  - Estimate: medium

- [ ] `T5` — Pipeline runner: scene generation step (Gemini + Imagen)
  - Files: src/lib/pipeline/scenes.ts
  - Description: Use Gemini to generate scene prompts from tip text, then Imagen 4 to generate images. Configurable model, aspect ratio, scene count. Falls back to category backgrounds.
  - Estimate: medium

- [ ] `T6` — Pipeline runner: video render step (Pillow + FFmpeg)
  - Files: src/lib/pipeline/video.ts
  - Description: Compose multi-scene reel/short with Ken Burns motion, branding overlays, BGM + voice mix. Uses reel-config.json pattern. Returns MP4 path.
  - Estimate: large

- [ ] `T7` — Pipeline runner: social image step (Pillow)
  - Files: src/lib/pipeline/social-image.ts
  - Description: Generate square social post image with AI background + branded overlays. Returns image path.
  - Estimate: small

- [ ] `T8` — Pipeline orchestrator + run API
  - Files: src/lib/pipeline/runner.ts, src/app/api/pipelines/[id]/run/route.ts, src/app/api/pipeline-runs/[id]/route.ts
  - Depends: T4, T5, T6, T7
  - Description: Orchestrate steps based on template config. Track run status. Store outputs. Connect to post creation + publish flow.
  - Estimate: medium

### Wave 3 — UI (depends on Wave 1 + 2)
- [ ] `T9` — Pipeline list + create pages
  - Files: src/app/pipelines/page.tsx, src/app/pipelines/new/page.tsx
  - Estimate: medium

- [ ] `T10` — Pipeline detail + run UI
  - Files: src/app/pipelines/[id]/page.tsx, src/app/pipelines/[id]/run/page.tsx
  - Description: Show template config, run history. Run form: input tip content, generate, preview media, approve, publish.
  - Estimate: medium

- [ ] `T11` — Tenant branding UI
  - Files: src/app/tenants/[id]/page.tsx (add branding tab)
  - Description: Logo/background/intro/outro uploads, color pickers, BGM upload. Preview branding.
  - Estimate: medium

- [ ] `T12` — Sidebar + navigation update
  - Files: src/components/sidebar.tsx
  - Description: Add "Pipelines" nav link. Add pipeline indicator on dashboard.
  - Estimate: small

### Wave 4 — Seed + deploy
- [ ] `T13` — Seed Area6 pipeline template from existing configs
  - Description: Migrate reel-config.json + social-post-config.json into a pipeline template for tenant area6. Copy branding assets.
  - Estimate: small

- [ ] `T14` — Build + deploy + verify
  - Estimate: small
