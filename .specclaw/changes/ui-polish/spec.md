# Spec: UI Polish & Fixes

## Requirements

### FR1: Fix TypeScript params (Critical)
- All `[id]` pages must use Next.js 15 `params: Promise<{id: string}>` pattern
- await params before use

### FR2: Fix production data fetching (Critical)
- Posts page: use db.prepare() directly instead of fetch("http://localhost:3000")
- All server components should query db directly

### FR3: Platform credential management UI
- Tenant detail page: "Add Platform" button
- Form: select type (youtube/ig/fb), paste credentials JSON, save
- Show existing platforms with edit/delete buttons
- Mask sensitive fields in display

### FR4: Dashboard improvements
- Recent 5 posts with status badges
- Pending approval count with link to filtered posts
- Platform health per tenant (token expiry check)

### FR5: Sidebar active state
- Highlight current page link in sidebar
- Use Next.js usePathname()

### FR6: Calendar grid
- Monthly grid view (7 columns)
- Posts shown as dots/badges on their scheduled date
- Click date to see posts

### FR7: Tenant context
- Tenant switcher stores selection in cookie/localStorage
- All pages filter by selected tenant
- Posts, calendar, dashboard scoped to tenant

## Acceptance Criteria
1. `npx tsc --noEmit` passes with 0 errors (excluding mcp/)
2. All pages render in production without errors
3. Can add/edit/delete platform credentials from UI
4. Dashboard shows real data
5. Calendar shows monthly grid
