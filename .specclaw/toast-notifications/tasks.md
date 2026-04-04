# Tasks: Toast Notifications

## Task 1: Install sonner and add Toaster to layout
- Run `npm install sonner` in the project root
- Add `<Toaster>` component to `src/app/layout.tsx` inside the `<body>` tag, after `<TenantProvider>`
- Style the Toaster: dark theme, zinc-900 background, white text, orange accent for success
- Configuration: position="top-right", richColors=false, custom theme

## Task 2: Replace all alert() calls in platform-card.tsx
- Import `toast` from 'sonner'
- Line 74: `alert(data.error || "Failed to delete platform")` → `toast.error(data.error || "Failed to delete platform")`
- Line 79: `alert("Failed to delete platform")` → `toast.error("Failed to delete platform")`
- Line 113: `if (!res.ok) alert(...)` → `toast.error(...)`
- Line 114: `alert(data.data.message)` → `toast.success(data.data.message)`
- Line 115: `alert('Refresh failed')` → `toast.error('Refresh failed')`

## Task 3: Build and test
- Run `NODE_OPTIONS='--max-old-space-size=1024' npm run build`
- Verify no build errors
