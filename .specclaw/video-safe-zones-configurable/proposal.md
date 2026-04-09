# Proposal: Configurable Video Safe Zones Per Platform (Issue #33)

## Problem
The reel/short renderer uses hard-coded overlay positions for logo, watermark, and text. Different platforms place UI chrome in different regions, so a one-size-fits-all layout can hide branding or important copy behind controls.

## Solution
Add configurable safe-zone and overlay-position settings to video pipeline templates so each template can define platform-aware spacing and placements. Use sensible defaults for Instagram, YouTube, and Facebook, then calculate a conservative effective layout when a template targets multiple platforms.

## Scope
- Extend video template configuration to store platform-specific safe zones and overlay positions
- Update the pipeline creation UI so editors can configure these values in the existing dark zinc/orange flow, with mobile-friendly grouped inputs
- Update pipeline detail views to show the configured safe-zone settings clearly
- Update the reel/short render pipeline to apply the configured safe zones instead of hard-coded coordinates
- Preserve existing behavior with fallback defaults when no custom safe-zone config is provided

## Files Expected
- `src/app/pipelines/new/page.tsx`
- `src/app/pipelines/[id]/page.tsx`
- `src/lib/pipeline/runner.ts`
- `src/lib/pipeline/video.ts`
- `src/lib/pipeline/video-render.py`
- `src/lib/types.ts`

## Risk
Medium-low. This changes renderer layout behavior and the template config shape, but it is backward-compatible if defaults remain in place and existing templates keep rendering without migration.
