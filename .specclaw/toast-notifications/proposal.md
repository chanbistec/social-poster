# Proposal: Toast Notifications (Issue #24)

## Problem
All user feedback uses `alert()` — blocks the UI, looks terrible, no differentiation between success/error.

## Solution
Add `sonner` toast library (lightweight, Next.js-native) and replace all `alert()` calls with styled toasts.

## Scope
- Install `sonner`
- Add `<Toaster>` to root layout with dark theme styling (zinc-950, orange accents)
- Replace 5 `alert()` calls in `platform-card.tsx` with appropriate `toast.success()` / `toast.error()` calls
- Style matches existing dark theme

## Files Changed
- `package.json` — add sonner dependency
- `src/app/layout.tsx` — add Toaster component
- `src/components/platform-card.tsx` — replace alert() with toast()

## Risk
Low — isolated UI change, no backend changes.
