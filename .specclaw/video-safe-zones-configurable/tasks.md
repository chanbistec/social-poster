# Tasks: Configurable Video Safe Zones Per Platform

## Task 1: Define configurable safe-zone shape
- Add a typed structure for video safe zones / overlay positions in the app config layer
- Support per-platform settings for Instagram, YouTube, and Facebook
- Keep backward compatibility with existing templates by falling back to defaults

## Task 2: Expose settings in pipeline template UI
- Add mobile-friendly form controls in the pipeline create flow for per-platform top/bottom/side safe zones
- Add position controls for key overlays that depend on safe zones (logo and watermark)
- Keep styling aligned with the zinc-950/900 and orange accent design

## Task 3: Apply config in the render pipeline
- Pass the configured safe-zone data from template config into the video renderer
- Replace hard-coded text/logo/watermark coordinates with computed positions derived from safe-zone settings
- Use the most restrictive safe bounds when a template targets multiple platforms

## Task 4: Surface config in pipeline detail page
- Show the saved safe-zone/platform configuration in a readable card on the template detail screen
- Make it easy to confirm what the renderer will use before running the pipeline

## Task 5: Validate and ship
- Run the app build and any relevant checks
- Manually verify at least one rendered layout path or config flow if feasible
- Commit, push, close issue #33, and deploy the updated app
