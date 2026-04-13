# Tasks: Meta OAuth UI Flow

## Task 1: Define the Meta connection flow
- Confirm available app credentials/config sources
- Decide the redirect URI and callback contract
- Define what credentials must be stored for Facebook vs Instagram publishing

## Task 2: Build server-side OAuth endpoints
- Add a start endpoint that validates tenant/platform intent and redirects to Meta OAuth
- Add a callback endpoint that validates state, exchanges the token, fetches page/account metadata, and upserts the platform row
- Persist `page_token`, `page_id`, and app credentials needed for refresh/publish

## Task 3: Update the platform connection UI
- Add a clear Meta connect action in the tenant platform modal/card flow
- Keep the existing zinc-950/900 dark theme with orange accents
- Make the flow readable and tap-friendly on mobile

## Task 4: Preserve fallback/manual editing
- Keep manual JSON editing available for advanced recovery cases
- Prevent the default add flow from nudging normal users toward token pasting for Meta

## Task 5: Validate end-to-end
- Run build/tests
- Manually verify the redirect/callback contract as far as possible without live user auth
- Confirm existing platform pages still render and existing refresh logic still compiles
