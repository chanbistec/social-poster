# Tasks: Scheduled Pipeline Runs

## Task 1: Persist future pipeline runs
- Add `scheduled_at` support to the `pipeline_runs` schema/types
- Accept an optional future schedule in the pipeline run API
- Keep immediate runs working exactly as they do today when no schedule is provided

## Task 2: Execute due scheduled runs automatically
- Reuse the app scheduler pattern to find due pipeline runs
- Start queued scheduled runs once their time arrives
- Prevent duplicate starts for the same run while it is being processed

## Task 3: Add scheduling UX and status visibility
- Add a mobile-friendly date/time picker to the pipeline run form
- Show scheduled state clearly in run progress/detail surfaces
- Preserve the dark zinc-950/900 theme and orange accents

## Task 4: Verify end-to-end behavior
- Test immediate runs still start right away
- Test future scheduled runs remain queued until due
- Run `NODE_OPTIONS='--max-old-space-size=1024' npm run build`
- Confirm the deployed PM2 app restarts cleanly
