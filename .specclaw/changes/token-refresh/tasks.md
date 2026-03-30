## Tasks

### Wave 1 (Core refresh logic)
- [ ] `T1` — Token refresh service: YouTube + Meta refresh functions
  - Files: src/lib/token-refresh.ts
  - Description: refreshYouTubeToken(credentials) → new access_token. exchangeMetaToken(short_token, app_id, app_secret) → long-lived token. refreshMetaToken(long_token) → refreshed token. Auto-update platforms table with new creds + token_expires_at.

- [ ] `T2` — Pre-publish token check + refresh middleware
  - Files: src/lib/publishers/index.ts, src/app/api/posts/[id]/publish/route.ts, src/app/api/pipeline-runs/[id]/publish/route.ts
  - Description: Before publishing, call ensureFreshTokens(platformRows) which checks token_expires_at, refreshes if needed, updates DB, returns fresh credentials.

### Wave 2 (Scheduler + UI)
- [ ] `T3` — Background token refresh in scheduler
  - Files: src/lib/scheduler.ts (modify existing)
  - Description: Every 30 minutes, check all platforms. If token_expires_at is within 1 hour, auto-refresh. Log refresh attempts.

- [ ] `T4` — Token health UI on tenant page + manual refresh button
  - Files: src/app/tenants/[id]/page.tsx, src/components/platform-card.tsx
  - Description: Show token status (valid/expiring/expired) with countdown. Add "Refresh Token" button per platform. Add Meta token exchange flow (paste short-lived → auto-exchange to long-lived).

### Wave 3 (Deploy)
- [ ] `T5` — Build + deploy + verify
