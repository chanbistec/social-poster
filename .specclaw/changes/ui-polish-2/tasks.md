## Tasks

### Wave 1 (Parallel)
- [ ] `T1` — Approval queue + tenant filtering on dashboard
  - Files: `src/app/dashboard/page.tsx`
  - Description: Add pending approval section with approve/reject action buttons (client component). Filter all dashboard stats by selected tenant (read from searchParams or cookie). Show "Pending Review" section prominently with post preview + action buttons.

- [ ] `T2` — Posts page: tenant filter + status filter + better list
  - Files: `src/app/posts/page.tsx`, `src/app/posts/new/page.tsx`
  - Description: Add tenant dropdown + status dropdown filters. Show platform badges on each post. Post creation page: add platform multi-select checkboxes, scheduled_at date picker, media upload area (drag & drop or click). Keep server component for data, client components for interactivity.

### Wave 2 (Depends on Wave 1)
- [ ] `T3` — Fix MCP server + auto-seed admin user
  - Files: `mcp/server.ts`, `src/lib/db.ts`
  - Description: Install @modelcontextprotocol/sdk, fix all TS errors in mcp/server.ts. Add auto-seed of admin user in db.ts init if users table is empty (so fresh installs work).

- [ ] `T4` — Build + deploy + verify
  - Description: Production build, restart PM2, verify all pages, commit + push.
