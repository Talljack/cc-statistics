# Budget Alerts & Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Proactively notify users when their daily cost, token usage, or account rate-limit windows exceed configurable thresholds, via system notifications and tray indicator changes.

**Architecture:** Add threshold settings to the settings store (daily cost limit, token limit, session-window warning percentage). On each data refresh (auto or manual), the frontend checks current metrics against thresholds. When a threshold is crossed, it fires a Tauri notification via `@tauri-apps/plugin-notification` and updates the tray icon color. A "muted until tomorrow" flag prevents notification spam. No backend changes needed — all threshold logic runs in the frontend against already-fetched data.

**Tech Stack:** React, Zustand (settingsStore), `@tauri-apps/plugin-notification`, Tauri tray API, i18n

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/lib/alerts.ts` (create) | Threshold checking logic — pure functions, testable |
| `src/lib/alerts.test.ts` (create) | Unit tests for threshold checks |
| `src/hooks/useAlerts.ts` (create) | Hook that runs checks on data change, fires notifications |
| `src/stores/settingsStore.ts` (modify) | Add alert threshold settings |
| `src/components/settings/AlertSettings.tsx` (create) | Settings UI for configuring thresholds |
| `src/components/pages/SettingsPage.tsx` (modify) | Add AlertSettings to General tab |
| `src/pages/Dashboard.tsx` (modify) | Mount useAlerts hook |
| `src/locales/en.json` (modify) | Alert i18n keys |
| `src/locales/zh.json` (modify) | Alert i18n keys |
| `src/locales/ja.json` (modify) | Alert i18n keys |

---

### Task 1: Define Alert Threshold Logic

**Files:**
- Create: `src/lib/alerts.ts`
- Create: `src/lib/alerts.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/alerts.test.ts
import { describe, it, expect } from 'vitest';
import { checkAlerts, type AlertConfig, type AlertInput, type AlertResult } from './alerts';

describe('checkAlerts', () => {
  const baseConfig: AlertConfig = {
    enabled: true,
    dailyCostLimit: 10,
    dailyTokenLimit: 1_000_000,
    sessionWindowWarning: 80,
  };

  it('returns no alerts when under thresholds', () => {
    const input: AlertInput = { dailyCost: 5, dailyTokens: 500_000, sessionUsedPercent: 50 };
    const result = checkAlerts(baseConfig, input);
    expect(result.alerts).toHaveLength(0);
  });

  it('fires cost alert when over daily limit', () => {
    const input: AlertInput = { dailyCost: 12, dailyTokens: 500_000, sessionUsedPercent: 50 };
    const result = checkAlerts(baseConfig, input);
    expect(result.alerts).toContainEqual(expect.objectContaining({ kind: 'cost_limit' }));
  });

  it('fires token alert when over daily limit', () => {
    const input: AlertInput = { dailyCost: 5, dailyTokens: 1_500_000, sessionUsedPercent: 50 };
    const result = checkAlerts(baseConfig, input);
    expect(result.alerts).toContainEqual(expect.objectContaining({ kind: 'token_limit' }));
  });

  it('fires session window alert when over warning threshold', () => {
    const input: AlertInput = { dailyCost: 5, dailyTokens: 500_000, sessionUsedPercent: 85 };
    const result = checkAlerts(baseConfig, input);
    expect(result.alerts).toContainEqual(expect.objectContaining({ kind: 'session_window' }));
  });

  it('returns no alerts when disabled', () => {
    const config = { ...baseConfig, enabled: false };
    const input: AlertInput = { dailyCost: 999, dailyTokens: 999_999_999, sessionUsedPercent: 99 };
    const result = checkAlerts(config, input);
    expect(result.alerts).toHaveLength(0);
  });

  it('skips check when limit is 0 (unconfigured)', () => {
    const config = { ...baseConfig, dailyCostLimit: 0 };
    const input: AlertInput = { dailyCost: 999, dailyTokens: 500_000, sessionUsedPercent: 50 };
    const result = checkAlerts(config, input);
    expect(result.alerts.find(a => a.kind === 'cost_limit')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/alerts.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/alerts.ts
export interface AlertConfig {
  enabled: boolean;
  dailyCostLimit: number;     // USD, 0 = disabled
  dailyTokenLimit: number;    // tokens, 0 = disabled
  sessionWindowWarning: number; // percentage (0-100), 0 = disabled
}

export interface AlertInput {
  dailyCost: number;
  dailyTokens: number;
  sessionUsedPercent: number; // highest across all providers
}

export interface Alert {
  kind: 'cost_limit' | 'token_limit' | 'session_window';
  message: string;
  value: number;
  limit: number;
}

export interface AlertResult {
  alerts: Alert[];
}

export function checkAlerts(config: AlertConfig, input: AlertInput): AlertResult {
  if (!config.enabled) return { alerts: [] };

  const alerts: Alert[] = [];

  if (config.dailyCostLimit > 0 && input.dailyCost > config.dailyCostLimit) {
    alerts.push({
      kind: 'cost_limit',
      message: `Daily cost $${input.dailyCost.toFixed(2)} exceeded limit $${config.dailyCostLimit.toFixed(2)}`,
      value: input.dailyCost,
      limit: config.dailyCostLimit,
    });
  }

  if (config.dailyTokenLimit > 0 && input.dailyTokens > config.dailyTokenLimit) {
    alerts.push({
      kind: 'token_limit',
      message: `Daily tokens ${input.dailyTokens.toLocaleString()} exceeded limit ${config.dailyTokenLimit.toLocaleString()}`,
      value: input.dailyTokens,
      limit: config.dailyTokenLimit,
    });
  }

  if (config.sessionWindowWarning > 0 && input.sessionUsedPercent > config.sessionWindowWarning) {
    alerts.push({
      kind: 'session_window',
      message: `Session window ${input.sessionUsedPercent.toFixed(0)}% used (warning at ${config.sessionWindowWarning}%)`,
      value: input.sessionUsedPercent,
      limit: config.sessionWindowWarning,
    });
  }

  return { alerts };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/alerts.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/alerts.ts src/lib/alerts.test.ts
git commit -m "feat: add alert threshold checking logic"
```

---

### Task 2: Add Alert Settings to Store

**Files:**
- Modify: `src/stores/settingsStore.ts`

- [ ] **Step 1: Add alert fields to SettingsStore interface**

Add these fields to the `SettingsStore` interface and default values:

```ts
// Interface additions
alertsEnabled: boolean;
dailyCostLimit: number;
dailyTokenLimit: number;
sessionWindowWarning: number;
alertsMutedUntil: string | null; // ISO timestamp, null = not muted

// Action additions
setAlertsEnabled: (enabled: boolean) => void;
setDailyCostLimit: (limit: number) => void;
setDailyTokenLimit: (limit: number) => void;
setSessionWindowWarning: (pct: number) => void;
setAlertsMutedUntil: (until: string | null) => void;
```

Default values:

```ts
alertsEnabled: false,
dailyCostLimit: 0,
dailyTokenLimit: 0,
sessionWindowWarning: 80,
alertsMutedUntil: null,
```

Actions:

```ts
setAlertsEnabled: (enabled) => set({ alertsEnabled: enabled }),
setDailyCostLimit: (limit) => set({ dailyCostLimit: limit }),
setDailyTokenLimit: (limit) => set({ dailyTokenLimit: limit }),
setSessionWindowWarning: (pct) => set({ sessionWindowWarning: pct }),
setAlertsMutedUntil: (until) => set({ alertsMutedUntil: until }),
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: Build succeeds (no type errors)

- [ ] **Step 3: Commit**

```bash
git add src/stores/settingsStore.ts
git commit -m "feat: add alert threshold settings to store"
```

---

### Task 3: Install Notification Plugin

**Files:**
- Modify: `package.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/default.json`

- [ ] **Step 1: Install plugin**

Run: `pnpm add @tauri-apps/plugin-notification`
Run: `cd src-tauri && cargo add tauri-plugin-notification`

- [ ] **Step 2: Register plugin**

Add `.plugin(tauri_plugin_notification::init())` to builder in `src-tauri/src/lib.rs`.

- [ ] **Step 3: Add permission**

Add `"notification:default"` to `src-tauri/capabilities/default.json` permissions.

- [ ] **Step 4: Verify build**

Run: `cd src-tauri && cargo build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml src-tauri/Cargo.toml src-tauri/src/lib.rs src-tauri/capabilities/default.json
git commit -m "feat: add tauri notification plugin"
```

---

### Task 4: Create useAlerts Hook

**Files:**
- Create: `src/hooks/useAlerts.ts`

- [ ] **Step 1: Write the hook**

```ts
// src/hooks/useAlerts.ts
import { useEffect, useRef } from 'react';
import { sendNotification, isPermissionGranted, requestPermission } from '@tauri-apps/plugin-notification';
import { useSettingsStore } from '../stores/settingsStore';
import { checkAlerts, type AlertConfig, type AlertInput } from '../lib/alerts';
import type { ProviderUsage } from '../types/statistics';

export function useAlerts(
  dailyCost: number,
  dailyTokens: number,
  accountProviders?: ProviderUsage[],
) {
  const {
    alertsEnabled,
    dailyCostLimit,
    dailyTokenLimit,
    sessionWindowWarning,
    alertsMutedUntil,
    setAlertsMutedUntil,
  } = useSettingsStore();

  const lastAlertRef = useRef<string | null>(null);

  useEffect(() => {
    if (!alertsEnabled) return;

    // Check if muted
    if (alertsMutedUntil) {
      const mutedUntil = new Date(alertsMutedUntil);
      if (mutedUntil > new Date()) return;
      // Mute expired, clear it
      setAlertsMutedUntil(null);
    }

    const sessionUsedPercent = accountProviders
      ? Math.max(...accountProviders.map((p) => p.sessionUsedPercent), 0)
      : 0;

    const config: AlertConfig = {
      enabled: alertsEnabled,
      dailyCostLimit,
      dailyTokenLimit,
      sessionWindowWarning,
    };

    const input: AlertInput = {
      dailyCost,
      dailyTokens,
      sessionUsedPercent,
    };

    const result = checkAlerts(config, input);
    if (result.alerts.length === 0) return;

    // Deduplicate — only fire if alert set changed
    const alertKey = result.alerts.map((a) => a.kind).sort().join(',');
    if (alertKey === lastAlertRef.current) return;
    lastAlertRef.current = alertKey;

    // Fire notification
    (async () => {
      let permitted = await isPermissionGranted();
      if (!permitted) {
        const perm = await requestPermission();
        permitted = perm === 'granted';
      }
      if (!permitted) return;

      const body = result.alerts.map((a) => a.message).join('\n');
      sendNotification({
        title: 'CC Statistics Alert',
        body,
      });
    })();
  }, [alertsEnabled, dailyCost, dailyTokens, accountProviders, dailyCostLimit, dailyTokenLimit, sessionWindowWarning, alertsMutedUntil, setAlertsMutedUntil]);
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useAlerts.ts
git commit -m "feat: add useAlerts hook for threshold notifications"
```

---

### Task 5: Mount useAlerts in Dashboard

**Files:**
- Modify: `src/pages/Dashboard.tsx`

- [ ] **Step 1: Import and mount hook**

Add to Dashboard.tsx:

```tsx
import { useAlerts } from '../hooks/useAlerts';

// Inside Dashboard component, after costMetrics:
const totalDailyTokens = stats
  ? stats.tokens.input + stats.tokens.output + stats.tokens.cache_read + stats.tokens.cache_creation
  : 0;
useAlerts(costMetrics.totalCost, totalDailyTokens);
```

- [ ] **Step 2: Verify in dev mode**

Run: `pnpm tauri dev`
Expected: No errors, app loads normally

- [ ] **Step 3: Commit**

```bash
git add src/pages/Dashboard.tsx
git commit -m "feat: mount budget alerts in dashboard"
```

---

### Task 6: Create Alert Settings UI + i18n

**Files:**
- Create: `src/components/settings/AlertSettings.tsx`
- Modify: `src/components/pages/SettingsPage.tsx`
- Modify: `src/locales/en.json`
- Modify: `src/locales/zh.json`
- Modify: `src/locales/ja.json`

- [ ] **Step 1: Add i18n keys**

Add to all locale files:

```json
// en
"settings.alerts.title": "Budget Alerts",
"settings.alerts.desc": "Get notified when usage exceeds your limits",
"settings.alerts.enable": "Enable Alerts",
"settings.alerts.enableDesc": "Show system notifications when thresholds are crossed",
"settings.alerts.dailyCost": "Daily Cost Limit ($)",
"settings.alerts.dailyCostDesc": "Alert when daily cost exceeds this amount (0 = disabled)",
"settings.alerts.dailyTokens": "Daily Token Limit",
"settings.alerts.dailyTokensDesc": "Alert when daily tokens exceed this count (0 = disabled)",
"settings.alerts.sessionWindow": "Session Window Warning (%)",
"settings.alerts.sessionWindowDesc": "Alert when any provider session usage exceeds this percentage"
```

```json
// zh
"settings.alerts.title": "预算提醒",
"settings.alerts.desc": "当使用量超出限制时获得通知",
"settings.alerts.enable": "启用提醒",
"settings.alerts.enableDesc": "当超出阈值时显示系统通知",
"settings.alerts.dailyCost": "每日花费限制 ($)",
"settings.alerts.dailyCostDesc": "当日花费超出此金额时提醒 (0 = 禁用)",
"settings.alerts.dailyTokens": "每日 Token 限制",
"settings.alerts.dailyTokensDesc": "当日 Token 超出此数量时提醒 (0 = 禁用)",
"settings.alerts.sessionWindow": "会话窗口预警 (%)",
"settings.alerts.sessionWindowDesc": "当任何服务商会话用量超出此百分比时提醒"
```

```json
// ja
"settings.alerts.title": "予算アラート",
"settings.alerts.desc": "使用量が制限を超えた場合に通知を受け取る",
"settings.alerts.enable": "アラートを有効化",
"settings.alerts.enableDesc": "閾値を超えた場合にシステム通知を表示",
"settings.alerts.dailyCost": "日次コスト制限 ($)",
"settings.alerts.dailyCostDesc": "日次コストがこの金額を超えた場合にアラート (0 = 無効)",
"settings.alerts.dailyTokens": "日次トークン制限",
"settings.alerts.dailyTokensDesc": "日次トークンがこの数を超えた場合にアラート (0 = 無効)",
"settings.alerts.sessionWindow": "セッションウィンドウ警告 (%)",
"settings.alerts.sessionWindowDesc": "プロバイダーのセッション使用率がこの割合を超えた場合にアラート"
```

- [ ] **Step 2: Create AlertSettings component**

```tsx
// src/components/settings/AlertSettings.tsx
import { useSettingsStore } from '../../stores/settingsStore';
import { useTranslation } from '../../lib/i18n';
import { Bell } from 'lucide-react';

export function AlertSettings({ Toggle, SettingItem }: {
  Toggle: React.ComponentType<{ checked: boolean; onChange: (v: boolean) => void }>;
  SettingItem: React.ComponentType<{
    icon: React.ReactNode; iconColor: string;
    title: string; description: string; right: React.ReactNode;
  }>;
}) {
  const { t } = useTranslation();
  const {
    alertsEnabled, dailyCostLimit, dailyTokenLimit, sessionWindowWarning,
    setAlertsEnabled, setDailyCostLimit, setDailyTokenLimit, setSessionWindowWarning,
  } = useSettingsStore();

  return (
    <section>
      <h3 className="text-base font-semibold mb-1">{t('settings.alerts.title')}</h3>
      <p className="text-xs text-[#808080] mb-3">{t('settings.alerts.desc')}</p>
      <div className="space-y-3">
        <SettingItem
          icon={<Bell className="w-5 h-5" />}
          iconColor="#f59e0b"
          title={t('settings.alerts.enable')}
          description={t('settings.alerts.enableDesc')}
          right={<Toggle checked={alertsEnabled} onChange={setAlertsEnabled} />}
        />
        {alertsEnabled && (
          <div className="ml-14 space-y-3">
            <div>
              <label className="text-xs text-[#808080] mb-1 block">{t('settings.alerts.dailyCost')}</label>
              <p className="text-[10px] text-[#606060] mb-1">{t('settings.alerts.dailyCostDesc')}</p>
              <input
                type="number" min="0" step="1" value={dailyCostLimit}
                onChange={(e) => setDailyCostLimit(parseFloat(e.target.value) || 0)}
                className="w-32 bg-[#2a2a2a] border border-[#333] rounded-md px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-[#3b82f6]"
              />
            </div>
            <div>
              <label className="text-xs text-[#808080] mb-1 block">{t('settings.alerts.dailyTokens')}</label>
              <p className="text-[10px] text-[#606060] mb-1">{t('settings.alerts.dailyTokensDesc')}</p>
              <input
                type="number" min="0" step="100000" value={dailyTokenLimit}
                onChange={(e) => setDailyTokenLimit(parseInt(e.target.value) || 0)}
                className="w-32 bg-[#2a2a2a] border border-[#333] rounded-md px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-[#3b82f6]"
              />
            </div>
            <div>
              <label className="text-xs text-[#808080] mb-1 block">{t('settings.alerts.sessionWindow')}</label>
              <p className="text-[10px] text-[#606060] mb-1">{t('settings.alerts.sessionWindowDesc')}</p>
              <input
                type="number" min="0" max="100" step="5" value={sessionWindowWarning}
                onChange={(e) => setSessionWindowWarning(parseInt(e.target.value) || 0)}
                className="w-32 bg-[#2a2a2a] border border-[#333] rounded-md px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-[#3b82f6]"
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Add AlertSettings to SettingsPage GeneralTab**

In `src/components/pages/SettingsPage.tsx`, import `AlertSettings` and add it after the Auto-Refresh section in `GeneralTab`. Pass the `Toggle` and `SettingItem` components as props.

- [ ] **Step 4: Verify in dev mode**

Run: `pnpm tauri dev`
Navigate to Settings, verify alert configuration appears.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/AlertSettings.tsx src/components/pages/SettingsPage.tsx src/locales/en.json src/locales/zh.json src/locales/ja.json src/stores/settingsStore.ts
git commit -m "feat: add budget alert settings UI with i18n"
```
