# Tasks: Calendar Drag-and-Drop Scheduling

## Task 1: Add a reschedule API
- Create a protected endpoint for moving a post to a different calendar day
- Accept approved and scheduled posts only
- Preserve the post time-of-day when possible, otherwise choose a safe default
- Reject moves to past dates with a clear error message

## Task 2: Make the calendar interactive
- Add drag-and-drop to post cards and calendar day cells
- Highlight valid drop targets and active drag state
- Keep the calendar readable and mobile-friendly in the dark zinc/orange theme

## Task 3: Refresh state and feedback
- Update local calendar state immediately after a successful move
- Show success and failure feedback without forcing a full page reload
- Keep selected-day details in sync after a move

## Task 4: Validate end-to-end
- Run the relevant build/tests
- Manually verify dragging a scheduled or approved post to a future day works
- Manually verify invalid moves are blocked and surfaced clearly
