# Proposal: AI Content Generation from Category Only

## Problem
Pipeline runs currently require the operator to manually write the title, tip text, and hashtags before generation can start. That slows down content creation and blocks the intended "pick a category and go" workflow described in issue #26.

## Proposed Change
Add an AI-assisted content brief generator for non-custom pipeline runs.

### User flow
1. User opens a pipeline run page.
2. User selects a category.
3. User clicks a new "Generate from category" action.
4. Gemini generates:
   - a short, social-ready title
   - the main tip/content text
   - a highlight word
   - relevant hashtags
5. The form is prefilled and still editable before the user runs the pipeline.

## Scope
- New API endpoint to generate a content brief from category + optional tenant/pipeline context
- Reusable Gemini helper in the app layer
- Run page UI updates for generation, loading, error handling, and prefill
- Styling stays aligned with the existing dark zinc/orange design and mobile layout

## Out of Scope
- Full content calendar automation
- Bulk generation of many posts at once
- Replacing manual editing, approval, or publishing controls

## Success Criteria
- A user can generate a usable draft by selecting only a category
- The generated fields populate the existing run form
- The user can still edit everything before running the pipeline
- Feature works cleanly on mobile and desktop
