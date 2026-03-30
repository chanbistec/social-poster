# Proposal: Automatic Token Refresh

## Problem
All 3 platform tokens expire regularly:
- YouTube: access_token expires hourly, refresh_token works if app not in Testing mode (7-day expiry otherwise)
- Meta (Instagram/Facebook): tokens expire based on app mode — Testing = ~1hr, Standard = 60 days with long-lived exchange

Publishing fails silently when tokens expire.

## Solution
1. **Auto-refresh on publish** — Before any publish attempt, check/refresh the token
2. **Background refresh scheduler** — Periodically refresh tokens before they expire
3. **Token health dashboard** — Show token status on tenant page
4. **Long-lived token exchange** — Automatically exchange short-lived Meta tokens for long-lived ones
5. **Store token_expires_at** — Track when tokens expire in the platforms table

## Platform-specific:
- **YouTube**: Use googleapis OAuth2 client to auto-refresh via refresh_token. Update stored credentials.
- **Meta**: Exchange short-lived token → long-lived (60-day) via `GET /oauth/access_token?grant_type=fb_exchange_token`. Refresh long-lived tokens before 60-day expiry.
