# Proposal: Dashboard Analytics (Issue #31)

## Problem
The dashboard shows operational health, but it does not answer basic performance questions at a glance. Users cannot quickly see how many publishes succeeded overall, how reliable publishing has been recently, or which platforms are carrying the load.

## Solution
Add an analytics section to the dashboard with four pieces:
- headline metrics for total published posts and publish success rate
- a recent activity chart for the last 7 days
- a platform breakdown showing publish attempts and success rates per platform
- supporting empty states and tenant-aware filtering

## Scope
- Extend dashboard queries to compute analytics from `posts` and `publish_results`
- Add compact analytics cards styled for the existing dark zinc/orange UI
- Add a simple 7 day activity chart using CSS bars, no extra charting library
- Add platform breakdown cards/table with attempts, successes, failures, and rate
- Keep layout mobile responsive and consistent with current dashboard sections

## Files Changed
- `src/app/dashboard/page.tsx`
- optional small helper component file if needed, but prefer keeping scope tight

## Risk
Medium-low. This is read-only analytics work on the dashboard page, with no schema changes and no publishing flow changes.

## Success Criteria
- Dashboard shows total published and success rate
- Dashboard shows 7 day recent activity visualization
- Dashboard shows per-platform breakdown
- Tenant filter affects analytics correctly
- `npm run build` passes
