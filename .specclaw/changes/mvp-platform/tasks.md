## Tasks

### Wave 1 (no dependencies — foundation)
- [x] `T1` — Project scaffolding + database
  - Files: `package.json`, `tsconfig.json`, `next.config.js`, `tailwind.config.ts`, `src/lib/db.ts`, `src/lib/types.ts`, `src/lib/crypto.ts`, `scripts/migrate.ts`
  - Estimate: medium
  - Description: Init Next.js 15 project with TypeScript, Tailwind, shadcn/ui. Set up SQLite with better-sqlite3. Create all tables (tenants, platforms, posts, publish_results, users). Auto-migrate on startup. AES-256-GCM encryption helper for credentials.

- [x] `T2` — Authentication system
  - Files: `src/lib/auth.ts`, `src/app/api/auth/login/route.ts`, `src/app/api/auth/me/route.ts`, `src/app/(auth)/login/page.tsx`, `src/middleware.ts`
  - Estimate: small
  - Description: bcrypt password hashing, JWT creation/verification, login API route, auth middleware protecting /api/* and /dashboard/*. Login page with username/password form. Auto-create admin user on first run if no users exist.

- [x] `T3` — Platform publishers
  - Files: `src/lib/publishers/youtube.ts`, `src/lib/publishers/instagram.ts`, `src/lib/publishers/facebook.ts`, `src/lib/publishers/index.ts`
  - Estimate: medium
  - Description: YouTube (googleapis resumable upload), Instagram (container API for photos + reels), Facebook (Graph API photo/video). Publisher registry that dispatches to correct publisher by platform type. Each returns {success, external_id, external_url, error}.

### Wave 2 (depends on Wave 1)
- [x] `T4` — Tenant + Platform API routes
  - Files: `src/app/api/tenants/route.ts`, `src/app/api/tenants/[id]/route.ts`, `src/app/api/platforms/route.ts`, `src/app/api/platforms/[id]/route.ts`
  - Depends: T1, T2
  - Estimate: small
  - Description: CRUD routes for tenants and platform connections. Credentials encrypted before storage. Token expiry tracking. All routes require JWT auth.

- [x] `T5` — Post API routes + publish orchestrator
  - Files: `src/app/api/posts/route.ts`, `src/app/api/posts/[id]/route.ts`, `src/app/api/posts/[id]/approve/route.ts`, `src/app/api/posts/[id]/reject/route.ts`, `src/app/api/posts/[id]/publish/route.ts`, `src/app/api/media/[id]/route.ts`, `src/lib/media.ts`
  - Depends: T1, T2, T3
  - Estimate: medium
  - Description: Post CRUD with status workflow (draft→pending→approved→scheduled→published). Media upload endpoint (multipart). Publish endpoint that dispatches to all selected platforms in parallel. Media serve route for Instagram container API. Track results per platform.

- [x] `T6` — Post scheduler
  - Files: `src/lib/scheduler.ts`
  - Depends: T1, T5
  - Estimate: small
  - Description: node-cron job running every minute. Queries due posts (status=scheduled, scheduled_at <= now). Publishes each via the publish orchestrator. Handles retries (max 3) with exponential backoff. Starts automatically with the Next.js server.

### Wave 3 (depends on Wave 2)
- [~] `T7` — Dashboard layout + tenant pages
  - Files: `src/app/layout.tsx`, `src/app/dashboard/page.tsx`, `src/app/tenants/page.tsx`, `src/app/tenants/[id]/page.tsx`, `src/app/tenants/new/page.tsx`, `src/components/sidebar.tsx`, `src/components/tenant-switcher.tsx`, `src/components/platform-badge.tsx`
  - Depends: T4
  - Estimate: medium
  - Description: App shell with sidebar navigation + tenant switcher. Dashboard overview showing recent posts, pending approvals, platform health per tenant. Tenant list page, tenant detail with platform credential management (add/edit/remove YouTube/IG/FB connections).

- [~] `T8` — Post composer + post list
  - Files: `src/app/posts/page.tsx`, `src/app/posts/new/page.tsx`, `src/app/posts/[id]/page.tsx`, `src/components/post-card.tsx`, `src/components/media-upload.tsx`
  - Depends: T5, T7
  - Estimate: medium
  - Description: Post list with status filters and tenant filter. Post composer: caption editor, media upload (drag-drop), platform selector (checkboxes), schedule date picker. Save as draft or submit for approval. Post detail shows publish results per platform with links.

- [~] `T9` — Content calendar
  - Files: `src/app/calendar/page.tsx`, `src/components/calendar-view.tsx`
  - Depends: T5, T7
  - Estimate: small
  - Description: Monthly calendar view. Posts shown on their scheduled/published date. Color-coded by status. Click to navigate to post detail. Tenant-filtered.

### Wave 4 (depends on Wave 3)
- [ ] `T10` — CLI tool
  - Files: `cli/index.ts`, `cli/package.json`
  - Depends: T4, T5
  - Estimate: medium
  - Description: Commander.js CLI. Commands: login, tenants (list/create/delete), platforms (add/list/remove), post (create/list/approve/reject/publish/schedule), status. Calls REST API. Stores config in ~/.social-poster/config.json. Supports --json output.

- [ ] `T11` — MCP server
  - Files: `mcp/server.ts`, `mcp/package.json`
  - Depends: T4, T5
  - Estimate: small
  - Description: MCP server with tools: create_post, list_posts, approve_post, schedule_post, publish_post, list_tenants, add_tenant, get_post_status. Uses @modelcontextprotocol/sdk with stdio transport. Calls REST API internally.

- [ ] `T12` — Integration tests + deployment
  - Files: `tests/api.test.ts`, `tests/publish.test.ts`, `Dockerfile`, `docker-compose.yml`, `scripts/setup.sh`
  - Depends: T1-T11
  - Estimate: medium
  - Description: API integration tests (tenant CRUD, post workflow, auth). Publisher mock tests. Docker setup for deployment. Setup script for first-run (creates admin user, data dirs). PM2 or systemd config for production.
