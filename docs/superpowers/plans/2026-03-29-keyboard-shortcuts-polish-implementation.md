# Keyboard Shortcuts & UX Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add keyboard shortcuts for common actions (refresh, navigation, time range switching) and a shortcut help overlay, improving power-user efficiency in the desktop app.

**Architecture:** Create a single `useKeyboardShortcuts` hook that registers global `keydown` listeners. Shortcuts use platform-aware modifiers (Cmd on macOS, Ctrl elsewhere). A `?` key opens a help overlay listing all available shortcuts. No new dependencies — uses native DOM events and React Router navigation.

**Tech Stack:** React, React Router, DOM KeyboardEvent, i18n

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/hooks/useKeyboardShortcuts.ts` (create) | Global keyboard shortcut handler |
| `src/hooks/useKeyboardShortcuts.test.ts` (create) | Tests for shortcut logic |
| `src/components/shortcuts/ShortcutHelpDialog.tsx` (create) | Overlay showing all shortcuts |
| `src/App.tsx` (modify) | Mount keyboard shortcuts hook |
| `src/locales/{en,zh,ja}.json` (modify) | Shortcut help i18n keys |

---

### Task 1: Define Keyboard Shortcuts Hook

**Files:**
- Create: `src/hooks/useKeyboardShortcuts.ts`
- Create: `src/hooks/useKeyboardShortcuts.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/hooks/useKeyboardShortcuts.test.ts
import { describe, it, expect, vi } from 'vitest';
import { parseShortcut, matchesShortcut } from './useKeyboardShortcuts';

describe('parseShortcut', () => {
  it('parses mod+r as meta on mac', () => {
    const parsed = parseShortcut('mod+r', true);
    expect(parsed).toEqual({ key: 'r', meta: true, ctrl: false, shift: false, alt: false });
  });

  it('parses mod+r as ctrl on non-mac', () => {
    const parsed = parseShortcut('mod+r', false);
    expect(parsed).toEqual({ key: 'r', meta: false, ctrl: true, shift: false, alt: false });
  });

  it('parses shift+/', () => {
    const parsed = parseShortcut('shift+/', true);
    expect(parsed).toEqual({ key: '/', meta: false, ctrl: false, shift: true, alt: false });
  });
});

describe('matchesShortcut', () => {
  it('matches mod+r on mac', () => {
    const event = new KeyboardEvent('keydown', { key: 'r', metaKey: true });
    expect(matchesShortcut(event, 'mod+r', true)).toBe(true);
  });

  it('does not match when modifier missing', () => {
    const event = new KeyboardEvent('keydown', { key: 'r' });
    expect(matchesShortcut(event, 'mod+r', true)).toBe(false);
  });

  it('matches single key', () => {
    const event = new KeyboardEvent('keydown', { key: '?' });
    expect(matchesShortcut(event, '?', true)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/hooks/useKeyboardShortcuts.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```ts
// src/hooks/useKeyboardShortcuts.ts
import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../stores/appStore';

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);

interface ParsedShortcut {
  key: string;
  meta: boolean;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
}

export function parseShortcut(shortcut: string, mac: boolean): ParsedShortcut {
  const parts = shortcut.toLowerCase().split('+');
  const key = parts[parts.length - 1];
  const hasMod = parts.includes('mod');
  const hasShift = parts.includes('shift');
  const hasAlt = parts.includes('alt');

  return {
    key,
    meta: hasMod && mac,
    ctrl: hasMod && !mac,
    shift: hasShift,
    alt: hasAlt,
  };
}

export function matchesShortcut(event: KeyboardEvent, shortcut: string, mac: boolean): boolean {
  const parsed = parseShortcut(shortcut, mac);
  return (
    event.key.toLowerCase() === parsed.key &&
    event.metaKey === parsed.meta &&
    event.ctrlKey === parsed.ctrl &&
    event.shiftKey === parsed.shift &&
    event.altKey === parsed.alt
  );
}

export interface ShortcutDef {
  shortcut: string;
  label: string;
  action: () => void;
}

export function useKeyboardShortcuts(onRefresh?: () => void) {
  const navigate = useNavigate();
  const { setCurrentView, currentView } = useAppStore();
  const [helpOpen, setHelpOpen] = useState(false);

  const shortcuts: ShortcutDef[] = [
    { shortcut: 'mod+r', label: 'shortcuts.refresh', action: () => onRefresh?.() },
    { shortcut: '1', label: 'shortcuts.dashboard', action: () => { setCurrentView('dashboard'); navigate('/'); } },
    { shortcut: '2', label: 'shortcuts.sessions', action: () => navigate('/sessions') },
    { shortcut: '3', label: 'shortcuts.report', action: () => navigate('/report') },
    { shortcut: '4', label: 'shortcuts.cost', action: () => navigate('/cost') },
    { shortcut: '5', label: 'shortcuts.account', action: () => navigate('/account') },
    { shortcut: '?', label: 'shortcuts.help', action: () => setHelpOpen((v) => !v) },
    { shortcut: 'mod+,', label: 'shortcuts.settings', action: () => setCurrentView('settings') },
    { shortcut: 'Escape', label: 'shortcuts.close', action: () => {
      if (helpOpen) setHelpOpen(false);
      else if (currentView === 'settings') setCurrentView('dashboard');
    }},
  ];

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      // Skip when typing in inputs
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        return;
      }

      for (const def of shortcuts) {
        if (matchesShortcut(event, def.shortcut, isMac)) {
          event.preventDefault();
          def.action();
          return;
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  return { helpOpen, setHelpOpen, shortcuts };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/hooks/useKeyboardShortcuts.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useKeyboardShortcuts.ts src/hooks/useKeyboardShortcuts.test.ts
git commit -m "feat: add keyboard shortcuts hook with platform-aware modifiers"
```

---

### Task 2: Create Shortcut Help Dialog

**Files:**
- Create: `src/components/shortcuts/ShortcutHelpDialog.tsx`

- [ ] **Step 1: Write component**

```tsx
// src/components/shortcuts/ShortcutHelpDialog.tsx
import { X } from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import type { ShortcutDef } from '../../hooks/useKeyboardShortcuts';

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);

function formatShortcutKey(shortcut: string): string {
  return shortcut
    .replace('mod', isMac ? '⌘' : 'Ctrl')
    .replace('shift', isMac ? '⇧' : 'Shift')
    .replace('alt', isMac ? '⌥' : 'Alt')
    .replace('Escape', 'Esc')
    .split('+')
    .map((k) => k.charAt(0).toUpperCase() + k.slice(1))
    .join(' + ');
}

export function ShortcutHelpDialog({
  open,
  onClose,
  shortcuts,
}: {
  open: boolean;
  onClose: () => void;
  shortcuts: ShortcutDef[];
}) {
  const { t } = useTranslation();

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-2xl p-6 w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{t('shortcuts.title')}</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--color-bg-hover)] transition-colors"
          >
            <X className="w-4 h-4 text-[var(--color-text-tertiary)]" />
          </button>
        </div>
        <div className="space-y-2">
          {shortcuts.map((def) => (
            <div
              key={def.shortcut}
              className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-[var(--color-bg-hover)]"
            >
              <span className="text-sm text-[var(--color-text-secondary)]">{t(def.label)}</span>
              <kbd className="px-2 py-1 bg-[var(--color-bg-hover)] border border-[var(--color-border)] rounded-md text-xs font-mono text-[var(--color-text-tertiary)]">
                {formatShortcutKey(def.shortcut)}
              </kbd>
            </div>
          ))}
        </div>
        <p className="text-xs text-[var(--color-text-muted)] mt-4 text-center">
          {t('shortcuts.hint')}
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/components/shortcuts/ShortcutHelpDialog.tsx
git commit -m "feat: add keyboard shortcut help dialog"
```

---

### Task 3: Mount Shortcuts in Dashboard + i18n

**Files:**
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/locales/en.json`
- Modify: `src/locales/zh.json`
- Modify: `src/locales/ja.json`

- [ ] **Step 1: Add i18n keys**

```json
// en
"shortcuts.title": "Keyboard Shortcuts",
"shortcuts.refresh": "Refresh data",
"shortcuts.dashboard": "Go to Dashboard",
"shortcuts.sessions": "Go to Sessions",
"shortcuts.report": "Go to Report",
"shortcuts.cost": "Go to Cost Breakdown",
"shortcuts.account": "Go to Account Usage",
"shortcuts.help": "Show shortcuts",
"shortcuts.settings": "Open Settings",
"shortcuts.close": "Close / Back",
"shortcuts.hint": "Press ? anywhere to show this dialog"
```

```json
// zh
"shortcuts.title": "键盘快捷键",
"shortcuts.refresh": "刷新数据",
"shortcuts.dashboard": "前往仪表板",
"shortcuts.sessions": "前往会话",
"shortcuts.report": "前往报告",
"shortcuts.cost": "前往费用明细",
"shortcuts.account": "前往账户用量",
"shortcuts.help": "显示快捷键",
"shortcuts.settings": "打开设置",
"shortcuts.close": "关闭 / 返回",
"shortcuts.hint": "随时按 ? 显示此对话框"
```

```json
// ja
"shortcuts.title": "キーボードショートカット",
"shortcuts.refresh": "データを更新",
"shortcuts.dashboard": "ダッシュボードへ",
"shortcuts.sessions": "セッションへ",
"shortcuts.report": "レポートへ",
"shortcuts.cost": "コスト内訳へ",
"shortcuts.account": "アカウント使用量へ",
"shortcuts.help": "ショートカットを表示",
"shortcuts.settings": "設定を開く",
"shortcuts.close": "閉じる / 戻る",
"shortcuts.hint": "いつでも ? キーでこのダイアログを表示"
```

- [ ] **Step 2: Mount in Dashboard**

In `src/pages/Dashboard.tsx`:

```tsx
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { ShortcutHelpDialog } from '../components/shortcuts/ShortcutHelpDialog';

// Inside Dashboard component:
const { helpOpen, setHelpOpen, shortcuts } = useKeyboardShortcuts(handleRefresh);

// Before closing </div> of the return:
<ShortcutHelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} shortcuts={shortcuts} />
```

- [ ] **Step 3: Verify in dev mode**

Run: `pnpm tauri dev`
Press `?` — help dialog appears. Press `1-5` — navigation works. Press `Cmd+R` — refreshes.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Dashboard.tsx src/locales/en.json src/locales/zh.json src/locales/ja.json
git commit -m "feat: integrate keyboard shortcuts with help dialog"
```

---

### Task 4: Add Shortcut Hint to Footer

**Files:**
- Modify: `src/components/layout/Footer.tsx`

- [ ] **Step 1: Add subtle hint text**

Add a small `?` hint in the footer to let users discover keyboard shortcuts:

```tsx
<span className="text-[var(--color-text-faint)] text-xs cursor-pointer hover:text-[var(--color-text-tertiary)]" title={t('shortcuts.hint')}>
  ⌨ ?
</span>
```

- [ ] **Step 2: Verify in dev mode**

Run: `pnpm tauri dev`
Verify hint appears in footer.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/Footer.tsx
git commit -m "feat: add keyboard shortcut hint to footer"
```
