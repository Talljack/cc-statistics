# Code Changes Theme Completion Design

**Date:** 2026-03-31

**Goal**

Complete theme token support for the code changes detail experience and improve the keyboard shortcut affordance in the footer without changing unrelated pages.

**Scope**

- Replace hard-coded colors in the code changes detail page summary cards, search input focus state, view mode toggle, diff file list containers, and unified/side-by-side diff rendering.
- Preserve existing color semantics:
  - Files: blue
  - Additions: green
  - Deletions: red
  - Net changes: purple
- Upgrade the footer shortcut hint from plain `⌨ ?` text to a small themed trigger that opens the existing shortcut help dialog.

**Design**

The page already has a dark/light theme token system in `src/styles/theme.css`. The bug is caused by the code changes detail UI bypassing those tokens with fixed dark backgrounds, borders, text colors, and selection states. The fix is to route those surfaces through existing theme variables and use `color-mix(...)` when a tinted variant of an accent is needed.

The shortcut hint should become an explicit affordance rather than a title-only label. The footer will expose an optional shortcut-help action and render a low-emphasis button using existing theme tokens plus a compact `?` keycap treatment. Dashboard will wire that action to the existing `ShortcutHelpDialog` state so the hint becomes discoverable without changing keyboard behavior.

**Files**

- Modify `src/pages/CodeChangesDetail.tsx`
- Modify `src/components/diff/DiffFileList.tsx`
- Modify `src/components/diff/UnifiedDiff.tsx`
- Modify `src/components/diff/SideBySideDiff.tsx`
- Modify `src/components/layout/Footer.tsx`
- Modify `src/pages/Dashboard.tsx`

**Validation**

- Run `pnpm test`
- Run `pnpm build`
