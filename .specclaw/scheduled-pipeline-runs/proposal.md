# Proposal: Scheduled Pipeline Runs (Issue #28)

## Problem
Pipeline runs can only start immediately. That blocks simple recurring workflows like preparing tomorrow morning’s gym tip or timing an academy upload for a specific publish window, and it forces operators to come back at the exact moment they want content generated.

## Solution
Allow operators to schedule a pipeline run for a future date and time from the existing pipeline run form. Scheduled runs should stay visible in the run history, wait in a queued state, and automatically start through the app’s scheduler when they become due.

## Scope
- Add an optional schedule control to the pipeline run form with dark zinc styling, orange accents, and mobile-friendly layout
- Extend the pipeline run API and persistence layer to store `scheduled_at` for future runs
- Update the pipeline scheduler/worker flow so due scheduled pipeline runs start automatically
- Surface scheduled state and timing in pipeline run detail/history views so operators understand what is waiting vs actively generating

## Files Likely Changed
- `src/app/pipelines/[id]/run/page.tsx`
- `src/app/api/pipelines/[id]/run/route.ts`
- `src/app/pipelines/[id]/page.tsx`
- `src/app/pipeline-runs/[id]/page.tsx`
- `src/app/pipeline-runs/[id]/run-progress-card.tsx`
- `src/lib/pipeline/runner.ts`
- `src/lib/scheduler.ts` or a nearby scheduler helper
- `src/lib/types.ts`
- `scripts/migrate.ts`

## Risk
Medium. This touches persistence, scheduler behavior, and operator-facing status messaging, but it can reuse the existing post scheduler pattern and preserve the current immediate-run flow when no schedule is set.
