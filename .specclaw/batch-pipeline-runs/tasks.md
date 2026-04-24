# Tasks: Batch Pipeline Runs

## Task 1: Extend generation and run APIs for batch inputs
- Allow the pipeline draft-generation endpoint to accept a `count` for non-custom pipelines
- Return a list of generated draft items with title, tip, highlight, hashtags, and category metadata
- Allow the pipeline run endpoint to accept either a single run payload or a `runs[]` batch payload
- Validate each queued run item and start every run in the background

## Task 2: Build batch-friendly run form UX
- Add a batch size selector for non-custom pipeline templates
- Show editable draft cards for each queued item with mobile-friendly stacking
- Preserve the existing dark zinc/orange visual system and keep custom pipelines single-upload only
- Keep single-run behavior simple when batch size is 1

## Task 3: Verify end-to-end behavior
- Test manual entry with batch size > 1
- Test category generation with batch size > 1
- Run project build: `NODE_OPTIONS='--max-old-space-size=1024' npm run build`
- Confirm the response/redirect still lands operators in a useful run detail flow
