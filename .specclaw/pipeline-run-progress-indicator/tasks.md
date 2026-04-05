# Tasks: Pipeline Run Progress Indicator

## Task 1: Make pipeline execution asynchronous
- Create the pipeline run row first and return `run_id` immediately from the API
- Start the real generation work in the background without blocking the HTTP response
- Preserve existing auth/validation behavior

## Task 2: Persist step-by-step progress
- Update the runner to write incremental `step_results` during generation
- Record clear step keys/states for narration, scenes, render, and finalization
- Keep existing success/failure handling intact

## Task 3: Add a live progress UI on the run detail page
- Show a step list with current state while status is `pending`/`generating`
- Auto-refresh or poll the run API until the run leaves the active state
- Keep styling consistent with the existing dark zinc/orange theme and mobile layout

## Task 4: Improve the run form submit UX
- Replace the long blocking submit state with a short "starting run" state
- Redirect to the run detail page as soon as the API returns the new run id

## Task 5: Validate end-to-end
- Run build/tests
- Manually create a run if feasible and verify the live progress page updates through completion or failure
