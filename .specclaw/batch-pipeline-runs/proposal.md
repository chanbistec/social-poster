# Proposal: Batch Pipeline Runs (Issue #27)

## Problem
Operators can only launch one pipeline run at a time from the pipeline run form. When they want a burst of content, they have to repeat the same submission flow over and over, which is slow and error-prone.

## Solution
Add a batch mode to the pipeline run form so operators can queue multiple runs in one submission. For non-custom templates, each queued run should get its own generated or manually supplied content while keeping the existing dark zinc UI, orange accents, and mobile responsiveness.

## Scope
- Add a batch size control on the pipeline run page for non-custom templates
- Let category-based draft generation produce multiple draft items at once for the selected category
- Allow operators to review/edit each draft item before submission
- Update the run API to accept multiple run inputs and create multiple background runs in one request
- Redirect to the newest created run while showing how many runs were queued

## Files Likely Changed
- `src/app/pipelines/[id]/run/page.tsx`
- `src/app/api/pipelines/[id]/run/route.ts`
- `src/app/api/pipelines/[id]/generate/route.ts`
- optional small shared helpers/types if needed

## Risk
Medium. This touches both run creation UX and pipeline run creation APIs, but it builds on existing single-run behavior rather than changing the runner itself.
