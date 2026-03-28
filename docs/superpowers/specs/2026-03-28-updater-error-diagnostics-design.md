# Updater Error Diagnostics Design

**Goal:** Improve the in-app updater failure experience so users get a clear explanation, actionable next steps, and expandable technical diagnostics when update checks or downloads fail.

## Problem

The current updater flow stores failures as a plain string and renders that string directly in the dialog. This creates two issues:

1. Users only see a raw low-level message and do not know what to do next.
2. Developers lose the original error structure, nested causes, request URL, and update stage.

## Design

### Structured error model

Replace the string-only update error state with a structured object that captures:

- update stage: `check`, `download`, or `install`
- short title for the UI
- user-facing summary
- suggested recovery actions
- technical details for debugging
- related URL when available

The error parser should preserve as much of the original object as possible by reading common fields such as `message`, `cause`, nested object values, and direct URL-like text. It should fall back to `String(error)` only when no richer signal is available.

### Friendly error presentation

The update dialog should render failures in three layers:

1. A compact title and summary that explain what failed in plain language.
2. A short list of suggested next actions tailored to likely causes.
3. A collapsed technical details panel for the full raw message chain and related URL.

The default view should stay calm and readable. Technical detail is available on demand and should not dominate the modal.

### Lightweight automatic suggestions

Map common failure patterns to user guidance:

- timeout or connection reset: suggest retrying in a moment
- SSL, TLS, or certificate keywords: suggest checking network environment, proxy, or HTTPS interception
- 404 or not found: suggest waiting for release asset sync and retrying
- generic request failure with URL: suggest retrying and using manual download if it persists
- unknown failures: show neutral fallback guidance and expose full details

The app should avoid pretending to know the exact root cause. Suggestions should be phrased as likely causes.

### Dialog actions

The error state should keep `Retry` as the primary action and add secondary recovery actions:

- re-check for updates
- open the latest release page in the browser
- copy technical details

These actions make the dialog useful in both user support and self-serve recovery scenarios.

## Files

- Modify: `src/stores/updateStore.ts`
- Modify: `src/components/UpdateDialog.tsx`
- Modify: `src/locales/en.json`
- Modify: `src/locales/zh.json`
- Add or modify tests near updater UI/store coverage

## Validation

- structured error parsing preserves nested message detail
- known error patterns produce appropriate suggestions
- update dialog shows summary first and technical details on demand
- retry and manual recovery actions remain available in the error state
