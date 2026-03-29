# Proposal: UI Polish & Fixes

## Problem
Wave 3 UI was built hastily. Several pages have TypeScript issues, missing features, and placeholder content. The dashboard is live at poster.qualitylife.lk but needs polish before it's usable.

## Issues Found
1. Dynamic route params use old Next.js pattern (breaks TS)
2. Posts page fetches from localhost:3000 (fails in production)
3. No platform credential management UI on tenant detail page
4. Dashboard has placeholder cards — no real data
5. No approval queue view
6. Calendar is a flat list, not a visual calendar
7. Sidebar has no active state
8. Tenant switcher doesn't persist or filter content

## Proposed Solution
Fix all issues in a single focused change with prioritized tasks.

## Scope
- Fix TypeScript/build errors
- Fix production data fetching
- Add platform credential management to tenant detail
- Add approval queue + recent posts to dashboard
- Better calendar grid
- Sidebar active state + tenant context
