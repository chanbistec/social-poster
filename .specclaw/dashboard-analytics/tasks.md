# Tasks: Dashboard Analytics

## Task 1: Add analytics queries to the dashboard
- Compute total published posts for the current tenant filter
- Compute publish result totals: attempts, successes, failures, success rate
- Compute a 7 day activity series from recent publish results or published posts
- Compute per-platform breakdown with attempts, successes, failures, and rate
- Make sure all queries work with and without `tenant_id`

## Task 2: Add analytics UI to `src/app/dashboard/page.tsx`
- Add headline analytics cards below the existing overview stats
- Add a recent activity chart panel for the last 7 days
- Add a platform breakdown panel
- Reuse the current dark theme: zinc-950/900 backgrounds, subtle borders, orange accents
- Keep layout responsive for mobile and desktop
- Add empty states for fresh installs with no publish history

## Task 3: Verify and polish
- Run `NODE_OPTIONS='--max-old-space-size=1024' npm run build`
- Fix any TypeScript or rendering issues
- Sanity check the tenant filter and empty states
