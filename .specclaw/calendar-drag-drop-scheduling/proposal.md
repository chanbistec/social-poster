# Proposal: Calendar Drag-and-Drop Scheduling (Issue #32)

## Problem
The calendar is already useful for seeing scheduled posts, but it is still read-only. When a user wants to move a scheduled post to another day, they have to leave the calendar and edit the post elsewhere. That breaks the planning workflow and makes the calendar feel unfinished.

## Solution
Upgrade the calendar into an interactive scheduling surface:
- allow scheduled and approved posts to be dragged onto another calendar day
- reschedule the post through an API endpoint that validates auth and future dates
- show clear success and error feedback in the calendar UI
- keep the existing dark zinc theme, orange highlights, and mobile usability intact

## Scope
- Add drag-and-drop support to the calendar day grid
- Add a focused API for moving a post to a new calendar day while preserving its scheduled time when possible
- Allow approved posts to become scheduled from the calendar when dropped onto a future date
- Refresh the calendar state after a successful move without a full page reload
- Keep selected-day details and mobile behavior usable after the interaction changes

## Files Expected
- `src/components/calendar-view.tsx`
- `src/app/api/posts/[id]/reschedule/route.ts`
- `src/app/calendar/page.tsx` (only if server data shape needs small adjustments)

## Risk
Medium-low. This is mostly isolated to the calendar UX and scheduling rules, but it touches date validation and post status transitions, so it needs careful testing.
