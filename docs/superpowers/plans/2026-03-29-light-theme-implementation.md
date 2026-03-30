# Light Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing theme toggle (light/dark/system) actually work by converting hardcoded dark colors to CSS custom properties and adding a complete light theme palette.

**Architecture:** Define CSS custom properties for all semantic colors (background, surface, border, text levels, accent colors) in `app.css`. Use a `data-theme="light|dark"` attribute on `<html>`. A small React hook reads the settings store `theme` value and applies the correct `data-theme`, respecting `system` via `prefers-color-scheme`. All component files replace hardcoded hex values (`#0f0f0f`, `#1a1a1a`, `#2a2a2a`, etc.) with `var(--color-*)` references. No new dependencies.

**Tech Stack:** CSS custom properties, Tailwind CSS 4, React, Zustand

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/styles/theme.css` (create) | CSS custom property definitions for light & dark |
| `src/hooks/useTheme.ts` (create) | Apply theme to DOM based on settings |
| `src/App.tsx` (modify) | Mount useTheme hook |
| `src/app.css` (modify) | Import theme.css, use variables for base styles |
| Multiple component files (modify) | Replace hardcoded colors with CSS variables |

---

### Task 1: Define Theme CSS Variables

**Files:**
- Create: `src/styles/theme.css`

- [ ] **Step 1: Create theme variable definitions**

```css
/* src/styles/theme.css */

/* Dark theme (default) */
:root,
[data-theme="dark"] {
  --color-bg-base: #0f0f0f;
  --color-bg-surface: #1a1a1a;
  --color-bg-elevated: #222222;
  --color-bg-hover: #2a2a2a;
  --color-bg-input: #2a2a2a;
  --color-bg-active: #333333;

  --color-border: #2a2a2a;
  --color-border-subtle: #222222;
  --color-border-input: #333333;

  --color-text-primary: #ffffff;
  --color-text-secondary: #a0a0a0;
  --color-text-tertiary: #808080;
  --color-text-muted: #606060;
  --color-text-faint: #505050;

  --color-accent-blue: #3b82f6;
  --color-accent-green: #22c55e;
  --color-accent-purple: #a855f7;
  --color-accent-yellow: #f59e0b;
  --color-accent-red: #ef4444;
  --color-accent-cyan: #06b6d4;
  --color-accent-orange: #f97316;
  --color-accent-pink: #ec4899;

  --color-shadow: rgba(0, 0, 0, 0.3);
}

/* Light theme */
[data-theme="light"] {
  --color-bg-base: #f5f5f5;
  --color-bg-surface: #ffffff;
  --color-bg-elevated: #fafafa;
  --color-bg-hover: #f0f0f0;
  --color-bg-input: #f0f0f0;
  --color-bg-active: #e5e5e5;

  --color-border: #e0e0e0;
  --color-border-subtle: #eeeeee;
  --color-border-input: #d0d0d0;

  --color-text-primary: #111111;
  --color-text-secondary: #555555;
  --color-text-tertiary: #777777;
  --color-text-muted: #999999;
  --color-text-faint: #bbbbbb;

  --color-accent-blue: #2563eb;
  --color-accent-green: #16a34a;
  --color-accent-purple: #9333ea;
  --color-accent-yellow: #d97706;
  --color-accent-red: #dc2626;
  --color-accent-cyan: #0891b2;
  --color-accent-orange: #ea580c;
  --color-accent-pink: #db2777;

  --color-shadow: rgba(0, 0, 0, 0.08);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/styles/theme.css
git commit -m "feat: define light and dark theme CSS variables"
```

---

### Task 2: Create useTheme Hook

**Files:**
- Create: `src/hooks/useTheme.ts`

- [ ] **Step 1: Write the hook**

```ts
// src/hooks/useTheme.ts
import { useEffect } from 'react';
import { useSettingsStore } from '../stores/settingsStore';

export function useTheme() {
  const theme = useSettingsStore((s) => s.theme);

  useEffect(() => {
    const applyTheme = (resolved: 'light' | 'dark') => {
      document.documentElement.setAttribute('data-theme', resolved);
    };

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      applyTheme(mq.matches ? 'dark' : 'light');

      const handler = (e: MediaQueryListEvent) => {
        applyTheme(e.matches ? 'dark' : 'light');
      };
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }

    applyTheme(theme);
  }, [theme]);
}
```

- [ ] **Step 2: Mount in App.tsx**

Import and call `useTheme()` inside the `App` component, before the return statement.

- [ ] **Step 3: Import theme.css in app.css**

Add `@import './styles/theme.css';` at the top of `src/app.css` (or whatever the main CSS entry point is).

- [ ] **Step 4: Verify build**

Run: `pnpm build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useTheme.ts src/App.tsx src/app.css
git commit -m "feat: add useTheme hook and mount in App"
```

---

### Task 3: Convert Dashboard Page Colors

**Files:**
- Modify: `src/pages/Dashboard.tsx`

- [ ] **Step 1: Replace hardcoded colors**

Apply these replacements throughout Dashboard.tsx:

| Hardcoded | CSS Variable |
|-----------|-------------|
| `bg-[#0f0f0f]` | `bg-[var(--color-bg-base)]` |
| `bg-[#1a1a1a]` | `bg-[var(--color-bg-surface)]` |
| `bg-[#2a2a2a]` | `bg-[var(--color-bg-hover)]` |
| `bg-[#222]` | `bg-[var(--color-bg-elevated)]` |
| `bg-[#333]` | `bg-[var(--color-bg-active)]` |
| `border-[#2a2a2a]` | `border-[var(--color-border)]` |
| `text-[#a0a0a0]` | `text-[var(--color-text-secondary)]` |
| `text-[#808080]` | `text-[var(--color-text-tertiary)]` |
| `text-[#606060]` | `text-[var(--color-text-muted)]` |

- [ ] **Step 2: Verify in dev mode**

Run: `pnpm tauri dev`
Toggle theme in settings, verify Dashboard colors change.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Dashboard.tsx
git commit -m "feat: convert Dashboard to theme variables"
```

---

### Task 4: Convert Shared Components

**Files:**
- Modify: `src/components/cards/StatCard.tsx`
- Modify: `src/components/layout/Header.tsx`
- Modify: `src/components/layout/Footer.tsx`

- [ ] **Step 1: Apply the same color replacements to all shared components**

Use the same mapping table from Task 3. Apply to StatCard, Header, and Footer.

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/components/cards/StatCard.tsx src/components/layout/Header.tsx src/components/layout/Footer.tsx
git commit -m "feat: convert shared components to theme variables"
```

---

### Task 5: Convert Chart Components

**Files:**
- Modify: `src/components/charts/DevTimeChart.tsx`
- Modify: `src/components/charts/TokenChart.tsx`
- Modify: `src/components/charts/CodeChanges.tsx`
- Modify: `src/components/charts/ToolUsageChart.tsx`
- Modify: `src/components/charts/SkillUsageChart.tsx`
- Modify: `src/components/charts/McpUsageChart.tsx`

- [ ] **Step 1: Apply color replacements to all chart wrappers**

Replace background, border, and text colors in chart wrapper divs. Note: Recharts internal colors (chart fill/stroke) should remain hardcoded accent colors — they don't need theme variants since they're always on a surface background.

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/components/charts/
git commit -m "feat: convert chart components to theme variables"
```

---

### Task 6: Convert All Remaining Pages

**Files:**
- Modify: `src/pages/Sessions.tsx`
- Modify: `src/pages/Instructions.tsx`
- Modify: `src/pages/CostBreakdown.tsx`
- Modify: `src/pages/Report.tsx`
- Modify: `src/pages/Skills.tsx`
- Modify: `src/pages/McpServers.tsx`
- Modify: `src/pages/CodeChangesDetail.tsx`
- Modify: `src/pages/AccountUsage.tsx`
- Modify: `src/pages/SessionDetail.tsx` (if created in Feature C)

- [ ] **Step 1: Apply color replacements to all pages**

Same mapping. Focus on backgrounds, borders, text colors. Leave accent colors (blue, green, red, etc.) as-is since they're already defined as CSS variables.

- [ ] **Step 2: Verify in dev mode with light theme**

Run: `pnpm tauri dev`
Toggle to light theme, navigate all pages, verify no hardcoded dark backgrounds remain.

- [ ] **Step 3: Commit**

```bash
git add src/pages/
git commit -m "feat: convert all pages to theme variables"
```

---

### Task 7: Convert Settings Page and Diff Components

**Files:**
- Modify: `src/components/pages/SettingsPage.tsx`
- Modify: `src/components/diff/DiffFileList.tsx`
- Modify: `src/components/diff/SideBySideDiff.tsx`
- Modify: `src/components/diff/UnifiedDiff.tsx`
- Modify: `src/components/settings/AlertSettings.tsx` (if created in Feature B)
- Modify: `src/components/export/ExportButton.tsx` (if created in Feature A)
- Modify: `src/components/UpdateDialog.tsx`

- [ ] **Step 1: Apply color replacements**

Same mapping for all components. Settings page has the most hardcoded colors (Toggle component, SettingItem, ExpandableSection).

- [ ] **Step 2: Full visual QA in dev mode**

Run: `pnpm tauri dev`
Test both light and dark themes across all pages and dialogs.

- [ ] **Step 3: Commit**

```bash
git add src/components/
git commit -m "feat: convert remaining components to theme variables"
```
