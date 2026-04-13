# Proposal: Meta OAuth UI Flow (Issue #29)

## Problem
Meta platform connections still require manually pasting credentials JSON into the platform modal. That is error-prone, hostile to non-technical users, and blocks a proper long-lived token lifecycle for Facebook and Instagram publishing.

## Solution
Add a tenant-scoped Meta OAuth flow in the UI:
- show a dedicated "Connect Meta" path instead of raw token pasting for Facebook/Instagram
- start the OAuth flow from the tenant platform UI
- handle the callback server-side, exchange the short-lived token for a long-lived token, fetch the selected page/account details, and persist credentials securely
- return the user to the tenant page with a clear success/error state

## Scope
- Add Meta OAuth start + callback API routes
- Reuse existing Meta token exchange utilities and credentials file fallback
- Update the tenant platform UI to expose a Meta connect action with dark zinc/orange styling and mobile-safe layout
- Store Facebook/Instagram platform credentials in the existing `platforms` table without requiring manual JSON entry
- Preserve manual JSON editing for advanced cases, but make OAuth the primary path for Meta

## Files Expected
- `src/app/api/platforms/meta/start/route.ts`
- `src/app/api/platforms/meta/callback/route.ts`
- `src/components/platform-form.tsx`
- `src/components/platform-card.tsx`
- `src/app/tenants/[id]/platform-actions.tsx`
- `src/lib/token-refresh.ts`
- `src/lib/types.ts`
- optional helper(s) under `src/lib/`

## Risk
Medium. OAuth callback correctness and account/page selection can be fiddly, but the change is isolated to platform connection UX and credential persistence rather than the publishing pipeline itself.
