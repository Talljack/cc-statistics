# Updater Error Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade updater failures from raw string output into a structured, friendly, diagnosable recovery flow.

**Architecture:** Parse updater exceptions into a structured client-side model in the Zustand store, then render a layered error state in the update dialog with tailored guidance and expandable technical details. Keep the implementation local to updater UI/state without changing the backend updater configuration.

**Tech Stack:** React 19, TypeScript, Zustand, Tauri updater plugin, Vitest, Testing Library

---

### Task 1: Define the updater error model

**Files:**
- Modify: `src/stores/updateStore.ts`
- Test: `src/stores/updateStore.test.ts` or the closest existing updater-facing test file

- [ ] **Step 1: Write failing tests for error parsing**

Cover:
- nested `cause` extraction
- stage-aware title and summary
- suggestion generation from timeout, SSL, 404, and generic request failures
- URL extraction when present

- [ ] **Step 2: Run the focused updater/store test**

Run: `pnpm vitest run <target-test-file>`
Expected: FAIL because the structured error model and parser do not exist yet

- [ ] **Step 3: Implement a structured update error parser**

Add:
- `UpdateFailureStage`
- `UpdateFailureDetails`
- helper functions to flatten nested error messages, infer suggestions, and extract URL text

- [ ] **Step 4: Update store actions to capture structured failures**

Apply the parser in:
- `checkForUpdate`
- `downloadAndInstall`
- `installUpdate` if needed for consistency

- [ ] **Step 5: Re-run the focused updater/store test**

Run: `pnpm vitest run <target-test-file>`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/stores/updateStore.ts <target-test-file>
git commit -m "feat: structure updater error diagnostics"
```

### Task 2: Redesign the update dialog error state

**Files:**
- Modify: `src/components/UpdateDialog.tsx`
- Modify: `src/locales/en.json`
- Modify: `src/locales/zh.json`
- Test: `src/components/UpdateDialog.test.tsx` or closest dialog coverage file

- [ ] **Step 1: Write failing UI tests for the error experience**

Cover:
- friendly summary renders before raw details
- suggestions render as actions/help items
- technical details are hidden by default and can be expanded
- manual recovery action is present in error state

- [ ] **Step 2: Run the focused update dialog test**

Run: `pnpm vitest run <target-dialog-test-file>`
Expected: FAIL because the current dialog only renders a raw error string

- [ ] **Step 3: Implement the dialog error redesign**

Add:
- clearer error card layout
- actionable suggestions
- expandable technical details block
- copy/open-release support as needed

- [ ] **Step 4: Add localized strings**

Add the new English and Chinese labels for:
- short summaries
- likely-cause guidance
- details toggle
- copy diagnostics
- manual download / open release page

- [ ] **Step 5: Re-run the focused update dialog test**

Run: `pnpm vitest run <target-dialog-test-file>`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/UpdateDialog.tsx src/locales/en.json src/locales/zh.json <target-dialog-test-file>
git commit -m "feat: improve updater error recovery dialog"
```

### Task 3: Verify the full updater flow

**Files:**
- Modify: test files only if verification exposes missing coverage

- [ ] **Step 1: Run targeted updater tests**

Run: `pnpm vitest run src/components/UpdateDialog.test.tsx src/stores/updateStore.test.ts`
Expected: PASS

- [ ] **Step 2: Run broader frontend test suite**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 3: Review the dialog copy and layout in code**

Confirm:
- summary-first hierarchy
- suggestions are concise
- technical details remain accessible but secondary

- [ ] **Step 4: Commit final verification follow-ups if needed**

```bash
git add <any-follow-up-files>
git commit -m "test: cover updater diagnostics flow"
```
