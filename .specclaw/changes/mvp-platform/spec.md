# Spec: MVP Platform

## Architecture

Monorepo with Next.js (frontend + API routes) + separate CLI + MCP server.

```
social-poster/
├── src/                      # Next.js app (dashboard + API)
│   ├── app/                  # App Router pages
│   │   ├── (auth)/           # Login page
│   │   ├── dashboard/        # Main dashboard
│   │   ├── tenants/          # Tenant management
│   │   │   └── [id]/         # Tenant detail
│   │   ├── posts/            # Post management
│   │   │   ├── new/          # Post composer
│   │   │   └── [id]/         # Post detail
│   │   ├── calendar/         # Content calendar view
│   │   └── api/              # API routes
│   │       ├── auth/         # Login/logout
│   │       ├── tenants/      # Tenant CRUD
│   │       ├── posts/        # Post CRUD + publish
│   │       ├── platforms/    # Platform credential management
│   │       └── schedule/     # Schedule management
│   ├── lib/                  # Shared logic
│   │   ├── db.ts             # SQLite via better-sqlite3
│   │   ├── auth.ts           # JWT + bcrypt
│   │   ├── publishers/       # Platform publishers
│   │   │   ├── youtube.ts
│   │   │   ├── instagram.ts
│   │   │   └── facebook.ts
│   │   ├── scheduler.ts      # Cron-based post scheduler
│   │   ├── media.ts          # Local media management
│   │   └── types.ts          # Shared types
│   └── components/           # React components
├── cli/                      # CLI tool
│   └── index.ts              # Commander.js CLI
├── mcp/                      # MCP server
│   └── server.ts             # MCP tool definitions
├── data/                     # Runtime data (gitignored)
│   ├── social-poster.db      # SQLite database
│   └── media/                # Uploaded media files
├── package.json
├── next.config.js
└── tsconfig.json
```

## Data Model

### Tenants
| Field | Type | Description |
|-------|------|-------------|
| id | TEXT PK | Slug (e.g., "area6") |
| name | TEXT | Display name |
| description | TEXT | |
| logo_path | TEXT | Local path to logo |
| created_at | DATETIME | |
| updated_at | DATETIME | |

### Platforms (per tenant)
| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PK | |
| tenant_id | TEXT FK | |
| type | TEXT | youtube/instagram/facebook |
| credentials | TEXT | JSON blob (encrypted) |
| config | TEXT | JSON (channel_id, page_id, ig_account_id, defaults) |
| token_expires_at | DATETIME | For auto-refresh |
| enabled | BOOLEAN | |

### Posts
| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PK | |
| tenant_id | TEXT FK | |
| status | TEXT | draft/pending_approval/approved/scheduled/publishing/published/failed |
| caption | TEXT | |
| hashtags | TEXT | JSON array |
| media_paths | TEXT | JSON array of local paths |
| platforms | TEXT | JSON array of platform types to publish to |
| scheduled_at | DATETIME | |
| approved_at | DATETIME | |
| approved_by | TEXT | |
| created_at | DATETIME | |
| updated_at | DATETIME | |

### Publish Results (per post per platform)
| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PK | |
| post_id | INTEGER FK | |
| platform | TEXT | youtube/instagram/facebook |
| status | TEXT | pending/publishing/published/failed |
| external_id | TEXT | Platform post/video ID |
| external_url | TEXT | URL to published content |
| error | TEXT | Error message if failed |
| published_at | DATETIME | |

### Users
| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PK | |
| username | TEXT UNIQUE | |
| password_hash | TEXT | bcrypt |
| role | TEXT | admin/viewer |
| created_at | DATETIME | |

## Functional Requirements

### FR1: Authentication
- Simple username/password login
- JWT tokens (24h expiry)
- Default admin user created on first run
- API routes protected with JWT middleware

### FR2: Tenant Management
- CRUD tenants via dashboard + API + CLI
- Each tenant has independent platform credentials
- Tenant switcher in dashboard header

### FR3: Platform Credentials
- Add/edit/remove platform connections per tenant
- YouTube: Google OAuth2 flow (redirect-based)
- Instagram/Facebook: Meta Graph API token input + auto-refresh
- Credentials stored encrypted in SQLite
- Visual indicator of token health (valid/expiring/expired)

### FR4: Post Composer
- Create posts with caption + media upload
- Select target platforms (checkboxes)
- Preview how it'll look on each platform
- Save as draft or submit for approval

### FR5: Approval Workflow
- Posts created as "draft"
- Submit → "pending_approval"
- Approve → "approved" (can schedule or publish immediately)
- Reject → back to "draft" with feedback
- Dashboard shows approval queue

### FR6: Scheduling
- Set date/time for approved posts
- node-cron checks every minute for due posts
- Publishes to all selected platforms
- Retry on transient failures (max 3 retries)

### FR7: Publishing
- YouTube: Upload video via googleapis
- Instagram: Container API (photo/reel) → publish
- Facebook: Graph API photo/video upload
- Media served via local temp URL for Instagram container API
- Results tracked per platform per post

### FR8: Content Calendar
- Monthly/weekly calendar view
- Posts shown on their scheduled date
- Color-coded by status (draft=gray, pending=yellow, approved=green, published=blue, failed=red)
- Click to view/edit post

### FR9: CLI
- `social-poster login` — authenticate
- `social-poster tenants list|create|delete`
- `social-poster platforms add|list|remove --tenant <id>`
- `social-poster post create --tenant <id> --caption "..." --media file.mp4 --platforms youtube,instagram`
- `social-poster post approve|reject|publish|schedule <post-id>`
- `social-poster posts list --tenant <id> [--status draft|published|...]`

### FR10: MCP Server
- Tools: create_post, list_posts, approve_post, schedule_post, list_tenants, get_post_status
- Connects to the same SQLite database
- Runs as stdio MCP server for OpenClaw/Claude

## Acceptance Criteria

1. Can create a tenant "area6" with YouTube + Instagram + Facebook credentials
2. Can compose a post with image/video, select platforms, save as draft
3. Can approve a draft post → it becomes schedulable
4. Can schedule a post for a future time → it auto-publishes
5. Can see all posts in a calendar view
6. CLI can create + approve + publish a post in 3 commands
7. MCP server exposes create_post + approve_post tools
8. Dashboard loads in <2s, works on mobile
9. Platform tokens auto-refresh before expiry
