# Code Changes Theme Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete theme token support for the code changes detail UI and replace the footer shortcut hint with a themed shortcut-help trigger.

**Architecture:** Keep the existing component structure. Replace fixed colors with theme tokens or `color-mix(...)` in the affected page and diff components, then wire the footer shortcut affordance to the existing `ShortcutHelpDialog` state in `Dashboard`.

**Tech Stack:** React 19, TypeScript, Tailwind utility classes with CSS variables, Vitest, Vite

---

### Task 1: Theme the code changes detail shell

**Files:**
- Modify: `src/pages/CodeChangesDetail.tsx`

- [ ] Step 1: Replace summary card, input focus, and toggle hard-coded colors with theme-token based classes and inline token styles where needed.
- [ ] Step 2: Ensure the selected toggle state and summary card accents preserve the existing blue/green/red/purple semantics.

### Task 2: Theme the diff file list and diff renderers

**Files:**
- Modify: `src/components/diff/DiffFileList.tsx`
- Modify: `src/components/diff/UnifiedDiff.tsx`
- Modify: `src/components/diff/SideBySideDiff.tsx`

- [ ] Step 1: Replace fixed dark backgrounds, borders, muted grays, and hover colors with theme tokens.
- [ ] Step 2: Keep diff add/remove highlights readable in both themes using accent tokens and `color-mix(...)`.
- [ ] Step 3: Keep extension badges and diff counters visually consistent with themed containers.

### Task 3: Upgrade the footer shortcut hint

**Files:**
- Modify: `src/components/layout/Footer.tsx`
- Modify: `src/pages/Dashboard.tsx`

- [ ] Step 1: Extend `Footer` with an optional shortcut-help action.
- [ ] Step 2: Replace the removed `⌨ ?` hint with a themed button using an icon plus a `?` keycap treatment.
- [ ] Step 3: Wire the button to `ShortcutHelpDialog` in `Dashboard`.

### Task 4: Verify

**Files:**
- Test: `package.json`

- [ ] Step 1: Run `pnpm test`
- [ ] Step 2: Run `pnpm build`
- [ ] Step 3: Summarize any remaining risk if verification passes without UI snapshots.
