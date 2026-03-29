## Tasks

### Wave 1 (Critical fixes — no dependencies)
- [ ] `T1` — Fix TypeScript params + production data fetching
  - Files: `src/app/tenants/[id]/page.tsx`, `src/app/posts/[id]/page.tsx`, `src/app/posts/page.tsx`, `src/app/calendar/page.tsx`, `src/app/dashboard/page.tsx`
  - Estimate: small
  - Description: Fix Next.js 15 async params pattern. Replace fetch("localhost") with direct db queries in server components. Fix dashboard to show real recent posts and pending approval count.

- [ ] `T2` — Sidebar active state + tenant context
  - Files: `src/components/sidebar.tsx`, `src/components/tenant-switcher.tsx`, `src/app/layout.tsx`
  - Estimate: small
  - Description: Convert sidebar to client component with usePathname() for active link highlighting. Tenant switcher persists to localStorage, provides context to child pages via URL params or context.

### Wave 2 (Feature additions — depends on Wave 1)
- [ ] `T3` — Platform credential management UI
  - Files: `src/app/tenants/[id]/page.tsx`, `src/components/platform-form.tsx`, `src/components/platform-card.tsx`
  - Depends: T1
  - Estimate: medium
  - Description: Add Platform button on tenant detail. Modal/form for adding credentials per platform type. Display existing platforms as cards with edit/delete. Mask secrets in display.

- [ ] `T4` — Calendar grid view
  - Files: `src/app/calendar/page.tsx`, `src/components/calendar-view.tsx`
  - Depends: T1, T2
  - Estimate: medium
  - Description: Monthly calendar grid (7 columns, Mon-Sun). Posts shown as colored dots on dates. Navigation: prev/next month. Click date shows posts for that day. Scoped to selected tenant.

### Wave 3 (Polish)
- [ ] `T5` — Rebuild + deploy
  - Files: `next.config.js`, `ecosystem.config.cjs`
  - Depends: T1, T2, T3, T4
  - Estimate: small
  - Description: Production build, restart PM2, verify all pages on poster.qualitylife.lk, commit + push.
