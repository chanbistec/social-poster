# Proposal: MVP Platform

## Problem

We have a working content pipeline (area6-health-tips) that generates AI images, reels, and posts — but publishing to each platform is manual scripting. As Chandima onboards more businesses, each with separate social accounts, this doesn't scale. There's no way to:

- Manage multiple tenants/businesses from one place
- See scheduled content visually
- Configure platform credentials per tenant
- Let the pipeline (or an AI agent) publish via a clean API/CLI
- Track what was posted where and when

## Proposed Solution

**Social Poster** — a self-hosted multi-tenant social media platform that runs on our Hetzner VPS.

### Core Components

1. **Backend API** (Node.js/Express + SQLite)
   - Multi-tenant: each business is a "tenant" with its own config, credentials, content
   - REST API for all operations (CRUD tenants, posts, schedules, platforms)
   - OAuth token management with auto-refresh for each platform
   - Post queue with scheduling (cron-based)
   - Media upload + temp hosting for Instagram API requirements

2. **CLI** (`social-poster`)
   - `social-poster tenants list/create/config`
   - `social-poster post --tenant area6 --platforms youtube,instagram,facebook --media video.mp4 --caption "..."`
   - `social-poster schedule --tenant area6 --at "2026-03-30T08:00" ...`
   - `social-poster status --tenant area6`
   - Clean enough for AI agents (OpenClaw) to call programmatically

3. **MCP Server** (Model Context Protocol)
   - Exposes tools: `create_post`, `schedule_post`, `list_tenants`, `get_analytics`
   - Any MCP-compatible agent (OpenClaw, Claude, Codex) can publish content
   - Reads config from the backend API

4. **Web Dashboard** (React/Next.js or simple HTML+Alpine)
   - Tenant switcher
   - Content calendar (visual schedule)
   - Post composer with platform preview
   - Credential management per platform
   - Upload history + analytics
   - Runs on the same server (port 3100 or similar)

### Platform Support (MVP)

| Platform | Post Types | Auth Method |
|----------|-----------|-------------|
| YouTube | Shorts, Videos | Google OAuth2 |
| Instagram | Photos, Reels | Meta Graph API (Page token) |
| Facebook | Photos, Videos, Reels | Meta Graph API (Page token) |

### Tenant Model

```
Tenant (e.g., "area6", "bistec-academy")
├── name, description, logo
├── platforms[]
│   ├── youtube: { credentials, channel_id, defaults }
│   ├── instagram: { credentials, ig_account_id, defaults }
│   └── facebook: { credentials, page_id, defaults }
├── content_config
│   ├── hashtags, captions templates
│   ├── posting schedule (cron)
│   └── branding (colors, fonts, assets)
└── posts[]
    ├── status: draft|scheduled|published|failed
    ├── platforms: [youtube, instagram, facebook]
    ├── media: [files...]
    ├── caption, hashtags
    └── publish_results: { platform: url/id }
```

### Tech Stack

- **Runtime:** Node.js (already on server)
- **Database:** SQLite (via better-sqlite3) — simple, no extra infra
- **API:** Express.js with JWT auth
- **Dashboard:** Lightweight — either Next.js or plain HTML + Alpine.js + Tailwind
- **CLI:** Commander.js
- **MCP:** @modelcontextprotocol/sdk
- **Queue:** node-cron for scheduled posts

## Scope

### In Scope (MVP)
- Tenant CRUD + platform credential management
- Post creation with multi-platform publishing
- Scheduling with cron
- CLI for all operations
- MCP server for AI agent integration
- Basic web dashboard (tenants, posts, schedule view)
- YouTube, Instagram, Facebook support

### Out of Scope (Future)
- TikTok, Pinterest, X/Twitter, LinkedIn
- Content generation (stays in area6-health-tips pipeline)
- Advanced analytics/reporting
- Team/role management
- Paid features / billing

## Impact

- **Chandima:** Visual dashboard to manage all businesses' social media
- **OpenClaw:** MCP/CLI interface to publish from any pipeline
- **Area6:** Current manual publish flow becomes automated
- **Bistec Academy:** Can onboard as second tenant immediately
- **Future businesses:** Just add a tenant, configure credentials, done

## Open Questions

1. Dashboard: Full Next.js or lightweight HTML+Alpine? (Next.js is heavier but more capable)
2. Should we support draft/approval workflow, or just direct publish?
3. Media storage: local filesystem or Cloudflare R2?
4. Auth for dashboard: simple password, or integrate with Discord/Google OAuth?

## Decisions

1. **Dashboard:** Next.js (full-featured, SSR, API routes built-in)
2. **Workflow:** Draft → Approval → Scheduled → Published (approval flow)
3. **Media storage:** Local filesystem
4. **Auth:** Simple password auth (bcrypt + JWT)
