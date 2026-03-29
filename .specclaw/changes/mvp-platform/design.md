# Design: MVP Platform

## Technical Approach

### Next.js App Router + API Routes
- Single deployment: dashboard + API in one Next.js app
- App Router for pages, Route Handlers for API
- Server components for data-heavy pages, client components for interactivity
- Tailwind CSS + shadcn/ui for consistent, professional UI

### Database: SQLite via better-sqlite3
- Sync API (fast, no async overhead)
- Single file: `data/social-poster.db`
- Migrations via simple SQL scripts on startup
- Encryption for credentials: AES-256-GCM with server secret

### Auth Flow
- `POST /api/auth/login` → returns JWT
- JWT stored in httpOnly cookie
- Middleware checks JWT on all `/api/*` and `/dashboard/*` routes
- First run: auto-creates admin user (prompted in terminal)

### Publishing Architecture
```
Post Created → Draft
     ↓ (submit)
Pending Approval
     ↓ (approve)
Approved → Schedule or Publish Now
     ↓ (scheduled time reached OR immediate)
Publishing (parallel per platform)
     ↓
Published / Partially Failed / Failed
```

Each platform publisher is independent:
- `publishers/youtube.ts` — googleapis, resumable upload
- `publishers/instagram.ts` — container API (needs public URL → local serve)
- `publishers/facebook.ts` — Graph API video/photo upload

### Instagram Media Hosting Problem
Instagram API requires a publicly accessible URL. Solution:
- On publish, start a temp Express static server on a random port
- Open that port via UPnP or use the VPS public IP (port already configured)
- Serve the media file
- Create container with that URL
- Wait for processing
- Publish
- Stop temp server

Alternative: Upload media to a `/api/media/[id]` route that's publicly accessible on the VPS.

### Scheduler
- `node-cron` runs every minute
- Queries: `SELECT * FROM posts WHERE status = 'scheduled' AND scheduled_at <= NOW()`
- For each due post: update status → "publishing", call publishers, update results
- Runs inside the Next.js process (no separate worker needed for MVP)

### CLI Architecture
- Commander.js with subcommands
- Calls the REST API (configurable base URL)
- Stores auth token in `~/.social-poster/config.json`
- Output: JSON or human-readable table (--json flag)

### MCP Server
- Standalone Node.js process using @modelcontextprotocol/sdk
- Direct SQLite access (same db file) OR calls REST API
- Tools map 1:1 to CLI commands
- Runs as stdio transport for OpenClaw integration

## File Map

| File | Purpose |
|------|---------|
| `src/app/layout.tsx` | Root layout with auth provider, sidebar |
| `src/app/(auth)/login/page.tsx` | Login page |
| `src/app/dashboard/page.tsx` | Overview: recent posts, pending approvals, platform health |
| `src/app/tenants/page.tsx` | Tenant list |
| `src/app/tenants/[id]/page.tsx` | Tenant detail + platform config |
| `src/app/posts/page.tsx` | Post list with filters |
| `src/app/posts/new/page.tsx` | Post composer |
| `src/app/posts/[id]/page.tsx` | Post detail + publish results |
| `src/app/calendar/page.tsx` | Content calendar |
| `src/app/api/auth/login/route.ts` | Auth endpoint |
| `src/app/api/tenants/route.ts` | Tenant CRUD |
| `src/app/api/posts/route.ts` | Post CRUD |
| `src/app/api/posts/[id]/approve/route.ts` | Approve post |
| `src/app/api/posts/[id]/publish/route.ts` | Publish now |
| `src/app/api/platforms/route.ts` | Platform CRUD |
| `src/app/api/media/[id]/route.ts` | Serve media (for IG) |
| `src/lib/db.ts` | SQLite init + migrations + queries |
| `src/lib/auth.ts` | JWT + bcrypt helpers |
| `src/lib/publishers/youtube.ts` | YouTube publisher |
| `src/lib/publishers/instagram.ts` | Instagram publisher |
| `src/lib/publishers/facebook.ts` | Facebook publisher |
| `src/lib/publishers/index.ts` | Publisher registry + orchestrator |
| `src/lib/scheduler.ts` | Cron scheduler |
| `src/lib/media.ts` | File upload + serve |
| `src/lib/crypto.ts` | AES encrypt/decrypt for credentials |
| `src/lib/types.ts` | TypeScript types |
| `src/components/sidebar.tsx` | Navigation sidebar |
| `src/components/tenant-switcher.tsx` | Tenant dropdown |
| `src/components/post-card.tsx` | Post summary card |
| `src/components/calendar-view.tsx` | Monthly calendar |
| `src/components/platform-badge.tsx` | Platform icon + status |
| `cli/index.ts` | CLI entry point |
| `mcp/server.ts` | MCP server |
| `scripts/migrate.ts` | DB migration runner |
