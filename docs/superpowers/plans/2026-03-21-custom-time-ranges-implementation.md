# Custom Time Ranges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add built-in plus custom time ranges with saved shortcuts, ad hoc date selection, and startup default support across the Tauri backend and React UI.

**Architecture:** Keep built-in ranges intact, introduce a shared time-range contract on both frontend and backend, persist saved custom ranges in the settings store, and layer the new UI into the existing header and settings page without changing the overall app structure. Implementation is split into a small serial foundation phase and parallel tracks with disjoint write scopes.

**Tech Stack:** React 19, TypeScript, Zustand persist, TanStack Query, Tauri 2, Rust, Chrono, Vitest, Testing Library

---

## File Structure

- Create: `src/types/timeRanges.ts`
- Create: `src/lib/timeRanges.ts`
- Create: `src/lib/timeRanges.test.ts`
- Create: `src/test/setup.ts`
- Create: `src/components/time-ranges/HeaderTimeRangeControl.tsx`
- Create: `src/components/time-ranges/MoreTimeRangesMenu.tsx`
- Create: `src/components/time-ranges/AdHocDateRangeDialog.tsx`
- Create: `src/components/settings/TimeRangeManagementSection.tsx`
- Create: `src/components/settings/EditTimeRangeDialog.tsx`
- Create: `src/components/settings/TimeRangeManagementSection.test.tsx`
- Create: `src/components/time-ranges/HeaderTimeRangeControl.test.tsx`
- Create: `src-tauri/src/time_ranges.rs`
- Modify: `package.json`
- Modify: `vite.config.ts`
- Modify: `src/stores/settingsStore.ts`
- Modify: `src/stores/filterStore.ts`
- Modify: `src/hooks/useStatistics.ts`
- Modify: `src/components/layout/Header.tsx`
- Modify: `src/components/pages/SettingsPage.tsx`
- Modify: `src/locales/zh.json`
- Modify: `src/locales/en.json`
- Modify: `src/locales/ja.json`
- Modify: `src-tauri/src/models.rs`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

## Parallel Execution Lanes

Serial prerequisites:

1. Test harness + shared frontend contract
2. Backend Rust range contract

After those land, run in parallel:

- Lane A: settings persistence and settings UI
- Lane B: header control, overflow menu, ad hoc dialog

Final serial task:

- Localization, verification, and merge fixes

### Task 1: Add Test Harness And Shared Frontend Time-Range Contract

**Files:**
- Create: `src/types/timeRanges.ts`
- Create: `src/lib/timeRanges.ts`
- Create: `src/lib/timeRanges.test.ts`
- Create: `src/test/setup.ts`
- Modify: `package.json`
- Modify: `vite.config.ts`

- [ ] **Step 1: Add failing helper tests**

```ts
import { describe, expect, it } from 'vitest';
import { getVisibleHeaderRanges, serializeStatisticsTimeRange } from './timeRanges';

describe('getVisibleHeaderRanges', () => {
  it('returns at most two pinned custom ranges', () => {
    expect(getVisibleHeaderRanges([])).toHaveLength(0);
  });
});

describe('serializeStatisticsTimeRange', () => {
  it('serializes an ad hoc absolute range payload', () => {
    expect(
      serializeStatisticsTimeRange({
        kind: 'ad_hoc',
        startDate: '2026-03-01',
        endDate: '2026-03-15',
      })
    ).toEqual({
      kind: 'absolute',
      startDate: '2026-03-01',
      endDate: '2026-03-15',
    });
  });
});
```

- [ ] **Step 2: Add Vitest + Testing Library**

Run: `pnpm add -D vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom`

- [ ] **Step 3: Wire scripts and test config**

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

```ts
test: {
  environment: 'jsdom',
  setupFiles: ['./src/test/setup.ts'],
}
```

- [ ] **Step 4: Implement the shared contract and pure helpers**

```ts
export type BuiltInTimeRangeKey = 'today' | 'week' | 'month' | 'all';

export type SavedTimeRange =
  | { id: string; label: string; kind: 'relative'; days: number; includeToday: boolean; showInHeader: boolean; sortOrder: number }
  | { id: string; label: string; kind: 'absolute'; startDate: string; endDate: string; showInHeader: boolean; sortOrder: number };

export type ActiveTimeRange =
  | { kind: 'built_in'; key: BuiltInTimeRangeKey }
  | { kind: 'custom'; id: string }
  | { kind: 'ad_hoc'; startDate: string; endDate: string };
```

- [ ] **Step 5: Run the helper tests**

Run: `pnpm exec vitest run src/lib/timeRanges.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add package.json vite.config.ts src/test/setup.ts src/types/timeRanges.ts src/lib/timeRanges.ts src/lib/timeRanges.test.ts
git commit -m "test: add time range test harness and shared helpers"
```

### Task 2: Add Rust Time-Range Query Contract

**Files:**
- Create: `src-tauri/src/time_ranges.rs`
- Modify: `src-tauri/src/models.rs`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing Rust tests for parsing and date filtering**

```rust
#[test]
fn parses_relative_range_payload() {
    let payload = serde_json::json!({
        "kind": "relative",
        "days": 14,
        "includeToday": true
    });
    let parsed: StatisticsTimeRange = serde_json::from_value(payload).unwrap();
    assert!(matches!(parsed, StatisticsTimeRange::Relative { days: 14, include_today: true }));
}
```

- [ ] **Step 2: Run Rust tests to verify failure**

Run: `cargo test time_ranges --manifest-path src-tauri/Cargo.toml`

Expected: FAIL because the contract module does not exist yet

- [ ] **Step 3: Implement query payload parsing and cutoff helpers**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum StatisticsTimeRange {
    BuiltIn { key: BuiltInTimeRangeKey },
    Relative { days: u32, include_today: bool },
    Absolute { start_date: String, end_date: String },
}
```

- [ ] **Step 4: Replace string-only `time_filter` command inputs**

Update `get_statistics`, `get_sessions`, and `get_instructions` to accept a structured payload and route through shared filter helpers in `src-tauri/src/time_ranges.rs`.

- [ ] **Step 5: Re-run Rust tests**

Run: `cargo test time_ranges --manifest-path src-tauri/Cargo.toml`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/time_ranges.rs src-tauri/src/models.rs src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: add structured time range queries in tauri"
```

### Task 3: Persist Saved Ranges And Active Filter State

**Files:**
- Modify: `src/stores/settingsStore.ts`
- Modify: `src/stores/filterStore.ts`
- Modify: `src/hooks/useStatistics.ts`

- [ ] **Step 1: Write failing store tests for migration and fallback**

Create a test that proves:

- old `defaultTimeFilter: "today"` still hydrates
- deleting the default custom range falls back to built-in `today`
- the active ad hoc range is not persisted as a saved custom range

- [ ] **Step 2: Run the store tests**

Run: `pnpm exec vitest run src/lib/timeRanges.test.ts`

Expected: FAIL until store logic is wired

- [ ] **Step 3: Replace `defaultTimeFilter` and `customTimeFilters` with the new model**

Add persisted fields:

```ts
defaultTimeRange: ActiveTimeRange;
savedTimeRanges: SavedTimeRange[];
```

Update actions for:

- add saved range
- update saved range
- delete saved range
- reorder header-pinned ranges
- set default range

- [ ] **Step 4: Update the filter store and query hooks**

`filterStore` should own:

```ts
activeTimeRange: ActiveTimeRange;
setActiveTimeRange: (range: ActiveTimeRange) => void;
```

`useStatistics`, `useSessions`, and `useInstructions` should invoke Tauri with structured `timeRange` payloads.

- [ ] **Step 5: Re-run targeted frontend tests**

Run: `pnpm exec vitest run src/lib/timeRanges.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/stores/settingsStore.ts src/stores/filterStore.ts src/hooks/useStatistics.ts
git commit -m "feat: persist saved time ranges and active filter state"
```

### Task 4: Build Header Custom Range Control

**Files:**
- Create: `src/components/time-ranges/HeaderTimeRangeControl.tsx`
- Create: `src/components/time-ranges/MoreTimeRangesMenu.tsx`
- Create: `src/components/time-ranges/AdHocDateRangeDialog.tsx`
- Create: `src/components/time-ranges/HeaderTimeRangeControl.test.tsx`
- Modify: `src/components/layout/Header.tsx`

- [ ] **Step 1: Write failing header tests**

Cover:

- built-ins always visible
- at most two custom ranges visible
- `More` shows active state when a hidden custom range is selected
- ad hoc date dialog confirm sets an ad hoc active range

- [ ] **Step 2: Run the header tests**

Run: `pnpm exec vitest run src/components/time-ranges/HeaderTimeRangeControl.test.tsx`

Expected: FAIL because the new control does not exist yet

- [ ] **Step 3: Implement the new header control**

Use `HeaderTimeRangeControl` to replace the inline built-in buttons in `Header.tsx`.

Expected shape:

```tsx
<HeaderTimeRangeControl
  activeRange={activeTimeRange}
  savedRanges={savedTimeRanges}
  onSelectRange={setActiveTimeRange}
  onOpenManageRanges={() => setView('settings')}
/>
```

- [ ] **Step 4: Re-run header tests**

Run: `pnpm exec vitest run src/components/time-ranges/HeaderTimeRangeControl.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/time-ranges/HeaderTimeRangeControl.tsx src/components/time-ranges/MoreTimeRangesMenu.tsx src/components/time-ranges/AdHocDateRangeDialog.tsx src/components/time-ranges/HeaderTimeRangeControl.test.tsx src/components/layout/Header.tsx
git commit -m "feat: add header custom time range controls"
```

### Task 5: Build Settings Time Range Management UI

**Files:**
- Create: `src/components/settings/TimeRangeManagementSection.tsx`
- Create: `src/components/settings/EditTimeRangeDialog.tsx`
- Create: `src/components/settings/TimeRangeManagementSection.test.tsx`
- Modify: `src/components/pages/SettingsPage.tsx`

- [ ] **Step 1: Write failing settings UI tests**

Cover:

- default range selector lists built-ins and saved ranges
- saved ranges list renders header-pinned state
- creating a relative range updates the store
- deleting the current default saved range falls back to `Today`

- [ ] **Step 2: Run the settings tests**

Run: `pnpm exec vitest run src/components/settings/TimeRangeManagementSection.test.tsx`

Expected: FAIL because the management section does not exist yet

- [ ] **Step 3: Implement the management section and edit dialog**

Mount `TimeRangeManagementSection` in the General tab, replacing the current fixed segmented `defaultTimeFilter` block.

- [ ] **Step 4: Re-run the settings tests**

Run: `pnpm exec vitest run src/components/settings/TimeRangeManagementSection.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/TimeRangeManagementSection.tsx src/components/settings/EditTimeRangeDialog.tsx src/components/settings/TimeRangeManagementSection.test.tsx src/components/pages/SettingsPage.tsx
git commit -m "feat: add settings time range management ui"
```

### Task 6: Localization, End-To-End Wiring, And Smoke Verification

**Files:**
- Modify: `src/locales/zh.json`
- Modify: `src/locales/en.json`
- Modify: `src/locales/ja.json`
- Modify: any small merge-fix files from Tasks 2-5

- [ ] **Step 1: Add all new copy keys**

Add labels for:

- header `More`
- `Custom Range...`
- `Manage Ranges`
- range type labels
- empty states
- create/edit/delete actions
- fallback messages

- [ ] **Step 2: Run the frontend test suite**

Run: `pnpm test`

Expected: PASS

- [ ] **Step 3: Run Rust tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`

Expected: PASS

- [ ] **Step 4: Run typecheck and production build**

Run: `pnpm build`

Expected: PASS

- [ ] **Step 5: Manual smoke test**

Run: `pnpm tauri dev`

Verify:

- startup respects built-in or saved default
- header shows built-ins + 0-2 pinned custom ranges + `More`
- ad hoc date range filters dashboard without saving
- settings create/edit/delete flows work
- deleting active/default saved ranges falls back to `Today`

- [ ] **Step 6: Commit**

```bash
git add src/locales/zh.json src/locales/en.json src/locales/ja.json
git commit -m "feat: finish custom time range flow"
```
