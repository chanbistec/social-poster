# Proposal: Pipeline Run Progress Indicator (Issue #25)

## Problem
Starting a pipeline run blocks the form submission for 1–2 minutes. Users only see a generic spinner and have no visibility into which step is running, whether the request actually started, or when they can review the output.

## Solution
Convert pipeline starts into an asynchronous flow:
- create the run record immediately and redirect to the run detail page
- continue execution in the background
- persist incremental step progress as `step_results` update
- poll the run detail page so users see live progress for narration, scenes, render, and final review readiness

## Scope
- Return `run_id` immediately from `POST /api/pipelines/:id/run`
- Add a background executor entrypoint around the existing pipeline runner
- Update the runner to write incremental step progress while generating
- Add a client-side live progress card on the run detail page with step states and auto-refresh while active
- Improve the run form submit state so it redirects quickly instead of waiting for the full pipeline

## Files Expected
- `src/lib/pipeline/runner.ts`
- `src/app/api/pipelines/[id]/run/route.ts`
- `src/app/pipeline-runs/[id]/page.tsx`
- `src/app/pipeline-runs/[id]/...` (new client helper if needed)
- `src/app/pipelines/[id]/run/page.tsx`

## Risk
Medium-low. This touches pipeline orchestration and UI state, but it stays within the existing SQLite-backed run model and does not change publishing behavior.
