# 03-29 Follow-up Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the remaining 03-29 work so keyboard shortcuts are global, budget alerts behave as designed, and the light theme no longer leaks dark-only styling.

**Architecture:** Keep the already-shipped 03-29 features intact and add small follow-up patches instead of refactoring from scratch. Reuse the existing settings store, query hooks, tray updater, and theme variable system; only add the minimum new state, helper functions, and tests needed to close the gaps.

**Tech Stack:** React, React Router, TanStack Query, Zustand, Tauri notification/dialog/tray APIs, Tailwind CSS 4, Vitest, Rust tests

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/pages/Dashboard.tsx` | Wire account usage data into alerts; keep tray sync behavior stable |
| `src/App.tsx` | Mount global keyboard shortcuts outside Dashboard |
| `src/hooks/useKeyboardShortcuts.ts` | Keep shortcut behavior global and refresh-safe |
| `src/components/shortcuts/ShortcutHelpDialog.tsx` | Render globally-mounted shortcut help |
| `src/lib/alerts.ts` | Threshold evaluation stays pure and testable |
| `src/hooks/useAlerts.ts` | Add mute-until-tomorrow behavior and tray alert sync |
| `src/components/settings/AlertSettings.tsx` | Show mute state / allow clearing mute if needed |
| `src/stores/settingsStore.ts` | Persist mute metadata already present; add helper action only if needed |
| `src/hooks/useStatistics.ts` | Reuse existing `useAccountUsage()` hook for alert inputs |
| `src/locales/en.json` | Fill missing alert strings and mute UI copy |
| `src/locales/zh.json` | Fill missing alert strings and mute UI copy |
| `src/locales/ja.json` | Fill missing alert strings and mute UI copy |
| `src-tauri/src/commands.rs` | Extend tray update payload only if tray alert status needs explicit backend data |
| `src-tauri/src/tray.rs` | Surface alert state in tray menu and, if stable, switch tray icon |
| `src/styles/theme.css` | Add any missing semantic variables discovered during cleanup |
| `src/components/pages/SettingsPage.tsx` | Replace hardcoded colors in the largest remaining settings surface |
| `src/components/UpdateDialog.tsx` | Remove hardcoded button/status colors that break in light theme |
| `src/pages/AccountUsage.tsx` | Replace dark-only warning/progress styling with semantic variables |
| `src/pages/CostBreakdown.tsx` | Replace hardcoded project/token/cost colors where they should be theme-aware |
| `src/components/charts/*.tsx` | Keep accent colors, remove hardcoded dark surfaces/borders where still present |
| `src-tauri/tests/opencode_openclaw_shared_pipeline.rs` | Fix stale test call signatures for current collection API |

---

### Task 1: Finish Budget Alert Locale Wiring

**Files:**
- Modify: `src/locales/en.json`
- Modify: `src/locales/zh.json`
- Modify: `src/locales/ja.json`
- Test: `src/components/pages/SettingsPage.test.tsx`

- [ ] **Step 1: Write the failing test expectation for the missing session-window copy**

Add a targeted assertion to `src/components/pages/SettingsPage.test.tsx` after the alert settings section is expanded:

```tsx
expect(
  within(alertSection).getByText('settings.alerts.sessionWindowDesc')
).not.toBeInTheDocument();
```

Then replace it with the real copy assertion once the locale keys exist:

```tsx
expect(
  within(alertSection).getByText(/session usage/i)
).toBeInTheDocument();
```

- [ ] **Step 2: Run test to verify the locale gap exists**

Run: `pnpm vitest run src/components/pages/SettingsPage.test.tsx`
Expected: FAIL because `settings.alerts.sessionWindowDesc` is rendered as a raw key

- [ ] **Step 3: Add the missing locale keys**

Add these keys to all three locale files:

```json
"settings.alerts.sessionWindowDesc": "Alert when any provider session usage exceeds this percentage",
"settings.alerts.mutedUntil": "Alerts muted until {{time}}",
"settings.alerts.clearMute": "Resume alerts"
```

Chinese:

```json
"settings.alerts.sessionWindowDesc": "当任一服务商的会话窗口用量超过该百分比时提醒",
"settings.alerts.mutedUntil": "提醒已静默至 {{time}}",
"settings.alerts.clearMute": "恢复提醒"
```

Japanese:

```json
"settings.alerts.sessionWindowDesc": "いずれかのプロバイダーのセッション使用率がこの割合を超えたら通知する",
"settings.alerts.mutedUntil": "{{time}} までアラートを停止中",
"settings.alerts.clearMute": "アラートを再開"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/components/pages/SettingsPage.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/locales/en.json src/locales/zh.json src/locales/ja.json src/components/pages/SettingsPage.test.tsx
git commit -m "fix: add missing budget alert locale strings"
```

---

### Task 2: Wire Session Window Alerts to Real Provider Data

**Files:**
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/hooks/useAlerts.ts`
- Test: `src/hooks/useAlerts.test.tsx`

- [ ] **Step 1: Write the failing hook test for session-window alerts**

Add this test to `src/hooks/useAlerts.test.tsx`:

```tsx
it('sends a session window notification when provider usage crosses the threshold', async () => {
  render(
    <AlertHarness
      dailyCost={1}
      dailyTokens={100}
      accountProviders={[
        {
          source: 'claude_code',
          planType: 'Pro',
          sessionUsedPercent: 92,
          sessionResetSeconds: 1800,
          weeklyUsedPercent: null,
          weeklyResetSeconds: 0,
          limitReached: false,
          email: null,
          accountName: null,
          creditsBalance: null,
        },
      ]}
    />
  );

  await waitFor(() => {
    expect(sendNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining('Session window'),
      })
    );
  });
});
```

- [ ] **Step 2: Run test to verify the hook supports the scenario**

Run: `pnpm vitest run src/hooks/useAlerts.test.tsx`
Expected: PASS for the hook itself; this confirms the remaining bug is the missing Dashboard wiring

- [ ] **Step 3: Wire Dashboard to `useAccountUsage()` and pass providers into alerts**

In `src/pages/Dashboard.tsx`:

```tsx
import { useAccountUsage } from '../hooks/useStatistics';

const { data: accountUsage } = useAccountUsage();
useAlerts(
  costMetrics.totalCost,
  dashboardTotalTokens,
  accountUsage?.providers ?? []
);
```

Keep the hook call near the existing cost/token alert call so the data flow is obvious. Do not duplicate provider-fetch logic inside `useAlerts`; keep `useAlerts` pure on inputs.

- [ ] **Step 4: Verify the Dashboard still builds and query behavior stays stable**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/Dashboard.tsx src/hooks/useAlerts.test.tsx
git commit -m "fix: wire session window alerts to account usage data"
```

---

### Task 3: Add Mute-Until-Tomorrow Alert Behavior

**Files:**
- Modify: `src/hooks/useAlerts.ts`
- Modify: `src/components/settings/AlertSettings.tsx`
- Modify: `src/components/pages/SettingsPage.test.tsx`
- Test: `src/hooks/useAlerts.test.tsx`

- [ ] **Step 1: Write the failing hook test for automatic mute-after-send**

Add to `src/hooks/useAlerts.test.tsx`:

```tsx
it('mutes alerts until tomorrow after sending a notification', async () => {
  render(<AlertHarness dailyCost={15} dailyTokens={500} />);

  await waitFor(() => {
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
    expect(setAlertsMutedUntilMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Implement mute-until-tomorrow in `useAlerts`**

After `sendNotification(...)` succeeds, set the mute timestamp to the next local midnight:

```ts
const nextMidnight = new Date();
nextMidnight.setHours(24, 0, 0, 0);
setAlertsMutedUntil(nextMidnight.toISOString());
```

Keep the existing expiry-clear behavior:

```ts
if (mutedUntil > new Date()) return;
setAlertsMutedUntil(null);
```

This keeps the implementation minimal: one notification per day unless the mute expires or the user explicitly clears it.

- [ ] **Step 3: Add visible mute state and clear action to `AlertSettings`**

Below the numeric inputs, render this only when `alertsMutedUntil` is set in the future:

```tsx
<div className="flex items-center gap-3 text-xs text-[var(--color-text-secondary)]">
  <span>{t('settings.alerts.mutedUntil', { time: new Date(alertsMutedUntil).toLocaleString() })}</span>
  <button
    type="button"
    onClick={() => setAlertsMutedUntil(null)}
    className="text-[var(--color-accent-blue)] hover:underline"
  >
    {t('settings.alerts.clearMute')}
  </button>
</div>
```

This is optional for the behavior, but it prevents "why didn't I get another alert?" confusion.

- [ ] **Step 4: Add/update tests for the mute UI**

In `src/components/pages/SettingsPage.test.tsx`, set:

```ts
alertsMutedUntil: '2099-01-01T00:00:00.000Z',
```

Then assert the mute banner and clear button render when alerts are enabled.

- [ ] **Step 5: Run tests**

Run: `pnpm vitest run src/hooks/useAlerts.test.tsx src/components/pages/SettingsPage.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useAlerts.ts src/components/settings/AlertSettings.tsx src/hooks/useAlerts.test.tsx src/components/pages/SettingsPage.test.tsx
git commit -m "feat: mute budget alerts until tomorrow after notification"
```

---

### Task 4: Add Alert State to Tray Display

**Files:**
- Modify: `src/hooks/useAlerts.ts`
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/tray.rs`

- [ ] **Step 1: Extend the tray payload with alert status**

Add an optional alert marker to the tray payload in Rust:

```rust
pub struct TrayDisplayStats {
    pub cost_usd: f64,
    pub sessions: usize,
    pub instructions: u64,
    pub total_tokens: u64,
    pub alert_level: Option<String>,
}
```

Use `"warning"` for any active budget alert. Keep the field optional so all existing call sites continue to compile as you update them.

- [ ] **Step 2: Send tray warning state from the frontend when alerts fire**

In `useAlerts.ts`, after computing `result.alerts`, call:

```ts
await invoke('update_tray_stats', {
  stats: {
    costUsd: dailyCost,
    sessions: 0,
    instructions: 0,
    totalTokens: dailyTokens,
    alertLevel: result.alerts.length > 0 ? 'warning' : null,
  },
});
```

Do not trust these values as the canonical tray totals; immediately after this task, keep Dashboard's existing `syncTrayTodayStats()` call as the source of truth for daily numbers. The alert flag only needs to influence tray presentation, not overwrite totals permanently.

- [ ] **Step 3: Update tray menu rendering**

In `src-tauri/src/tray.rs`, if `alert_level == Some("warning")`:

```rust
let cost_text = format!("Warning  ·  {}", cost_text);
let sessions_text = format!("Usage limit reached  ·  {}", sessions_text);
```

Prefer text-based warning state first. Only add icon swapping if the text-based version is verified and still too subtle.

- [ ] **Step 4: Verify tray updates still work**

Run: `pnpm build`
Expected: PASS

Manual QA:
1. Start app
2. Set a very low daily cost limit
3. Trigger refresh
4. Confirm tray text shows a warning prefix

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useAlerts.ts src/pages/Dashboard.tsx src-tauri/src/commands.rs src-tauri/src/tray.rs
git commit -m "feat: reflect budget alert state in tray display"
```

---

### Task 5: Move Keyboard Shortcuts to App Level

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/hooks/useKeyboardShortcuts.ts`
- Modify: `src/hooks/useKeyboardShortcuts.test.ts`

- [ ] **Step 1: Write the failing shortcut test for route-agnostic behavior**

Add a small integration-style test around the hook helpers, or a new component test, that verifies the help dialog and navigation shortcuts can be mounted without `Dashboard` state.

Minimal direction:

```tsx
render(
  <MemoryRouter initialEntries={['/sessions']}>
    <AppShortcutShell />
  </MemoryRouter>
);
fireEvent.keyDown(window, { key: '?', shiftKey: true });
expect(screen.getByText(/keyboard shortcuts/i)).toBeInTheDocument();
```

- [ ] **Step 2: Create an App-level shortcut shell in `App.tsx`**

Mount the hook once above routes:

```tsx
function GlobalShortcuts() {
  const queryClient = useQueryClient();
  const onRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['projects'] });
    queryClient.invalidateQueries({ queryKey: ['statistics'] });
    queryClient.invalidateQueries({ queryKey: ['sessions'] });
    queryClient.invalidateQueries({ queryKey: ['account-usage'] });
  };
  const { helpOpen, setHelpOpen, shortcuts } = useKeyboardShortcuts(onRefresh);

  return (
    <ShortcutHelpDialog
      open={helpOpen}
      onClose={() => setHelpOpen(false)}
      shortcuts={shortcuts}
    />
  );
}
```

Then render `<GlobalShortcuts />` inside the `QueryClientProvider` and router shell.

- [ ] **Step 3: Remove duplicate Dashboard mounting**

Delete the Dashboard-local shortcut hook and dialog instances so the dialog is not mounted multiple times.

- [ ] **Step 4: Run tests and build**

Run: `pnpm vitest run src/hooks/useKeyboardShortcuts.test.ts`
Run: `pnpm build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/pages/Dashboard.tsx src/hooks/useKeyboardShortcuts.ts src/hooks/useKeyboardShortcuts.test.ts
git commit -m "refactor: move keyboard shortcuts to app shell"
```

---

### Task 6: Finish the Highest-Impact Light Theme Cleanup

**Files:**
- Modify: `src/components/pages/SettingsPage.tsx`
- Modify: `src/components/UpdateDialog.tsx`
- Modify: `src/pages/AccountUsage.tsx`
- Modify: `src/pages/CostBreakdown.tsx`
- Modify: `src/components/charts/DevTimeChart.tsx`
- Modify: `src/components/charts/CodeChanges.tsx`
- Modify: `src/styles/theme.css` (only if new semantic variables are needed)

- [ ] **Step 1: Snapshot the remaining hardcoded color count**

Run:

```bash
rg -n "bg-\\[#|text-\\[#|border-\\[#|#[0-9a-fA-F]{6}" src/pages src/components
```

Record the baseline count in the commit message or PR notes. Current baseline is roughly 190 matches.

- [ ] **Step 2: Add any missing semantic variables before replacing colors**

If the same raw color appears in multiple states, define it once in `src/styles/theme.css`, for example:

```css
--color-status-success: #22c55e;
--color-status-warning: #f59e0b;
--color-status-danger: #ef4444;
--color-focus-ring: var(--color-accent-blue);
```

Do this before editing components so replacements stay consistent.

- [ ] **Step 3: Fix the biggest theme leaks first**

Replace hardcoded UI-surface colors in these files:

1. `src/components/pages/SettingsPage.tsx`
2. `src/components/UpdateDialog.tsx`
3. `src/pages/AccountUsage.tsx`
4. `src/pages/CostBreakdown.tsx`

Rules:
- Keep semantic accent/status colors if they communicate meaning.
- Replace hardcoded backgrounds, borders, hover states, and text neutrals with theme vars.
- Replace `focus:border-[#3b82f6]` with `focus:border-[var(--color-accent-blue)]`.

- [ ] **Step 4: Clean up charts that still assume dark surfaces**

Focus on wrapper backgrounds/borders in:

1. `src/components/charts/DevTimeChart.tsx`
2. `src/components/charts/CodeChanges.tsx`

Leave chart series colors alone unless they become unreadable in light mode.

- [ ] **Step 5: Verify build and visual regression risk**

Run: `pnpm build`
Expected: PASS

Run the grep again:

```bash
rg -n "bg-\\[#|text-\\[#|border-\\[#|#[0-9a-fA-F]{6}" src/pages src/components
```

Expected: significantly fewer matches; remaining matches should mostly be intentional accent colors

- [ ] **Step 6: Commit**

```bash
git add src/components/pages/SettingsPage.tsx src/components/UpdateDialog.tsx src/pages/AccountUsage.tsx src/pages/CostBreakdown.tsx src/components/charts/DevTimeChart.tsx src/components/charts/CodeChanges.tsx src/styles/theme.css
git commit -m "feat: finish high-impact light theme cleanup"
```

---

### Task 7: Repair Rust Test Signatures

**Files:**
- Modify: `src-tauri/tests/opencode_openclaw_shared_pipeline.rs`

- [ ] **Step 1: Write a small local helper inside the test file**

Add:

```rust
fn single_project(name: &str) -> Vec<String> {
    vec![name.to_string()]
}
```

- [ ] **Step 2: Replace stale `Some(\"...\")` calls with the current API shape**

Change:

```rust
Some("openclaw-demo")
```

to:

```rust
Some(single_project("openclaw-demo").as_slice())
```

If borrow lifetimes get awkward, bind a local variable first:

```rust
let project_filter = single_project("openclaw-demo");
let sessions = opencode::collect_normalized_sessions(Some(&project_filter), &absolute_same_day());
```

- [ ] **Step 3: Run the Rust test target**

Run: `cd src-tauri && cargo test --test opencode_openclaw_shared_pipeline`
Expected: PASS

- [ ] **Step 4: Run the full frontend regression suite**

Run: `pnpm test`
Run: `pnpm build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/tests/opencode_openclaw_shared_pipeline.rs
git commit -m "test: update shared pipeline tests for current project filter api"
```

---

## Suggested Execution Order

1. Task 1: locale wiring
2. Task 2: session-window alert input wiring
3. Task 3: mute-until-tomorrow behavior
4. Task 4: tray alert state
5. Task 5: global keyboard shortcuts
6. Task 6: light theme cleanup
7. Task 7: Rust test repair

## Ship Criteria

- Budget alerts fire for cost, token, and session-window thresholds
- Alert notifications are muted until the next day after firing, and users can see/clear mute state
- Tray text clearly reflects when an alert threshold is active
- Keyboard shortcuts work outside Dashboard
- Light theme has no major dark-surface leaks in settings, dialogs, account usage, or cost views
- `pnpm test` passes
- `pnpm build` passes
- `cd src-tauri && cargo test --test opencode_openclaw_shared_pipeline` passes
