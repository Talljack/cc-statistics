# Data Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to export their usage statistics as CSV, JSON, or Markdown from the Report page, enabling team reporting and billing accountability.

**Architecture:** Add a Rust backend command `export_report` that accepts format + filters, serializes session/stats data into the requested format, and returns the content string. The frontend adds an export dropdown to the Report page header that triggers a Tauri save-file dialog and writes the exported content. No new dependencies needed — Rust's `serde` handles JSON, CSV is hand-built (simple flat structure), and Markdown is template-based.

**Tech Stack:** Rust (serde, chrono), React, Tauri save dialog (`@tauri-apps/plugin-dialog`), i18n

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src-tauri/src/export.rs` (create) | Export formatting logic: CSV, JSON, Markdown |
| `src-tauri/src/commands.rs` (modify) | Add `export_report` command |
| `src-tauri/src/lib.rs` (modify) | Register new command |
| `src/components/export/ExportButton.tsx` (create) | Dropdown button with format selection + save dialog |
| `src/pages/Report.tsx` (modify) | Add ExportButton to report header |
| `src/locales/en.json` (modify) | Add export i18n keys |
| `src/locales/zh.json` (modify) | Add export i18n keys |
| `src/locales/ja.json` (modify) | Add export i18n keys |
| `src-tauri/src/export.test.rs` or inline `#[cfg(test)]` | Unit tests for export formatters |
| `src/components/export/ExportButton.test.tsx` (create) | UI test for export dropdown |

---

### Task 1: Add Export Formatting Module (Rust Backend)

**Files:**
- Create: `src-tauri/src/export.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write the failing test**

Add to `src-tauri/src/export.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn sample_rows() -> Vec<ExportRow> {
        vec![
            ExportRow {
                date: "2026-03-29".into(),
                project: "my-app".into(),
                session_id: "abc123".into(),
                model: "claude-opus-4-6".into(),
                source: "claude_code".into(),
                input_tokens: 1000,
                output_tokens: 500,
                cache_read_tokens: 200,
                cache_creation_tokens: 100,
                total_tokens: 1800,
                cost_usd: 0.045,
                duration_ms: 30000,
                instructions: 3,
                git_branch: "main".into(),
            },
        ]
    }

    #[test]
    fn formats_csv_with_header() {
        let csv = format_csv(&sample_rows());
        let lines: Vec<&str> = csv.lines().collect();
        assert_eq!(lines.len(), 2); // header + 1 row
        assert!(lines[0].starts_with("date,project,session_id,model"));
        assert!(lines[1].starts_with("2026-03-29,my-app,abc123"));
    }

    #[test]
    fn formats_json_array() {
        let json = format_json(&sample_rows());
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert!(parsed.is_array());
        assert_eq!(parsed.as_array().unwrap().len(), 1);
        assert_eq!(parsed[0]["project"], "my-app");
    }

    #[test]
    fn formats_markdown_table() {
        let md = format_markdown(&sample_rows(), "CC Statistics Report");
        assert!(md.contains("# CC Statistics Report"));
        assert!(md.contains("| Date |"));
        assert!(md.contains("| 2026-03-29 |"));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src-tauri && cargo test export::tests`
Expected: FAIL — module `export` not found

- [ ] **Step 3: Write minimal implementation**

```rust
// src-tauri/src/export.rs
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct ExportRow {
    pub date: String,
    pub project: String,
    pub session_id: String,
    pub model: String,
    pub source: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_creation_tokens: u64,
    pub total_tokens: u64,
    pub cost_usd: f64,
    pub duration_ms: u64,
    pub instructions: u64,
    pub git_branch: String,
}

pub fn format_csv(rows: &[ExportRow]) -> String {
    let mut out = String::from(
        "date,project,session_id,model,source,input_tokens,output_tokens,cache_read_tokens,cache_creation_tokens,total_tokens,cost_usd,duration_ms,instructions,git_branch\n"
    );
    for r in rows {
        out.push_str(&format!(
            "{},{},{},{},{},{},{},{},{},{},{:.6},{},{},{}\n",
            r.date, r.project, r.session_id, r.model, r.source,
            r.input_tokens, r.output_tokens, r.cache_read_tokens,
            r.cache_creation_tokens, r.total_tokens, r.cost_usd,
            r.duration_ms, r.instructions, r.git_branch
        ));
    }
    out
}

pub fn format_json(rows: &[ExportRow]) -> String {
    serde_json::to_string_pretty(rows).unwrap_or_else(|_| "[]".into())
}

pub fn format_markdown(rows: &[ExportRow], title: &str) -> String {
    let mut md = format!("# {}\n\n", title);
    md.push_str("| Date | Project | Model | Source | Tokens | Cost | Duration | Instructions |\n");
    md.push_str("|------|---------|-------|--------|--------|------|----------|-------------|\n");
    for r in rows {
        let duration = if r.duration_ms >= 60000 {
            format!("{}m", r.duration_ms / 60000)
        } else {
            format!("{}s", r.duration_ms / 1000)
        };
        md.push_str(&format!(
            "| {} | {} | {} | {} | {} | ${:.4} | {} | {} |\n",
            r.date, r.project, r.model, r.source,
            r.total_tokens, r.cost_usd, duration, r.instructions
        ));
    }
    // Summary row
    let total_tokens: u64 = rows.iter().map(|r| r.total_tokens).sum();
    let total_cost: f64 = rows.iter().map(|r| r.cost_usd).sum();
    let total_instructions: u64 = rows.iter().map(|r| r.instructions).sum();
    md.push_str(&format!(
        "\n**Total:** {} tokens, ${:.4} cost, {} instructions, {} sessions\n",
        total_tokens, total_cost, total_instructions, rows.len()
    ));
    md
}
```

Add `pub mod export;` to `src-tauri/src/lib.rs`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src-tauri && cargo test export::tests`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/export.rs src-tauri/src/lib.rs
git commit -m "feat: add export formatting module (CSV/JSON/Markdown)"
```

---

### Task 2: Add `export_report` Tauri Command

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write the Tauri command**

Add to `src-tauri/src/commands.rs`:

```rust
#[tauri::command]
pub fn export_report(
    sessions: Vec<crate::models::SessionInfo>,
    format: String,
    title: String,
) -> Result<String, String> {
    use crate::export::*;

    let rows: Vec<ExportRow> = sessions.iter().map(|s| {
        ExportRow {
            date: s.timestamp.split('T').next().unwrap_or(&s.timestamp).to_string(),
            project: s.project_name.clone(),
            session_id: s.session_id.clone(),
            model: s.model.clone(),
            source: s.source.clone(),
            input_tokens: s.input,
            output_tokens: s.output,
            cache_read_tokens: s.cache_read,
            cache_creation_tokens: s.cache_creation,
            total_tokens: s.total_tokens,
            cost_usd: s.cost_usd,
            duration_ms: s.duration_ms as u64,
            instructions: s.instructions as u64,
            git_branch: s.git_branch.clone(),
        }
    }).collect();

    match format.as_str() {
        "csv" => Ok(format_csv(&rows)),
        "json" => Ok(format_json(&rows)),
        "markdown" | "md" => Ok(format_markdown(&rows, &title)),
        _ => Err(format!("Unknown export format: {}", format)),
    }
}
```

- [ ] **Step 2: Register command in lib.rs**

Add `export_report` to the `generate_handler![]` macro in `src-tauri/src/lib.rs`.

- [ ] **Step 3: Verify build**

Run: `cd src-tauri && cargo build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: add export_report tauri command"
```

---

### Task 3: Add Tauri Dialog Plugin

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/capabilities/default.json`
- Modify: `package.json`

- [ ] **Step 1: Install dialog plugin**

Run: `cd /Users/yugangcao/apps/my-apps/cc-statistics && pnpm add @tauri-apps/plugin-dialog`
Run: `cd src-tauri && cargo add tauri-plugin-dialog`

- [ ] **Step 2: Register plugin in lib.rs**

Add `.plugin(tauri_plugin_dialog::init())` to the builder chain in `src-tauri/src/lib.rs`.

- [ ] **Step 3: Add dialog permission to capabilities**

Add `"dialog:default"` to `src-tauri/capabilities/default.json` permissions array.

- [ ] **Step 4: Verify build**

Run: `cd src-tauri && cargo build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/lib.rs package.json pnpm-lock.yaml src-tauri/capabilities/default.json
git commit -m "feat: add tauri dialog plugin for save file dialog"
```

---

### Task 4: Create ExportButton Component

**Files:**
- Create: `src/components/export/ExportButton.tsx`
- Create: `src/components/export/ExportButton.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/export/ExportButton.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock tauri
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue('date,project\n2026-03-29,test'),
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: vi.fn().mockResolvedValue('/tmp/export.csv'),
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  writeTextFile: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../stores/settingsStore', () => ({
  useSettingsStore: () => ({ language: 'en' }),
}));

import { ExportButton } from './ExportButton';

describe('ExportButton', () => {
  it('renders export button', () => {
    render(<ExportButton sessions={[]} title="Test Report" />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('shows format dropdown on click', async () => {
    const user = userEvent.setup();
    render(<ExportButton sessions={[]} title="Test Report" />);
    await user.click(screen.getByRole('button'));
    expect(screen.getByText('CSV')).toBeInTheDocument();
    expect(screen.getByText('JSON')).toBeInTheDocument();
    expect(screen.getByText('Markdown')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/components/export/ExportButton.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/export/ExportButton.tsx
import { useState, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { Download } from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import type { SessionInfo } from '../../types/statistics';

type ExportFormat = 'csv' | 'json' | 'markdown';

const FORMAT_OPTIONS: { format: ExportFormat; label: string; ext: string }[] = [
  { format: 'csv', label: 'CSV', ext: 'csv' },
  { format: 'json', label: 'JSON', ext: 'json' },
  { format: 'markdown', label: 'Markdown', ext: 'md' },
];

export function ExportButton({
  sessions,
  title,
}: {
  sessions: SessionInfo[];
  title: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleExport = async (format: ExportFormat) => {
    setOpen(false);
    if (sessions.length === 0) return;
    setExporting(true);
    try {
      const ext = FORMAT_OPTIONS.find((o) => o.format === format)!.ext;
      const content = await invoke<string>('export_report', {
        sessions,
        format,
        title,
      });
      const filePath = await save({
        defaultPath: `cc-statistics-report.${ext}`,
        filters: [{ name: format.toUpperCase(), extensions: [ext] }],
      });
      if (filePath) {
        await writeTextFile(filePath, content);
      }
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        disabled={exporting || sessions.length === 0}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#2a2a2a] hover:bg-[#333] text-sm transition-colors disabled:opacity-40"
      >
        <Download className={`w-4 h-4 ${exporting ? 'animate-pulse' : ''}`} />
        {t('export.button')}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-[#2a2a2a] border border-[#3a3a3a] rounded-lg shadow-xl z-50 py-1 min-w-[120px]">
          {FORMAT_OPTIONS.map((opt) => (
            <button
              key={opt.format}
              onClick={() => handleExport(opt.format)}
              className="w-full text-left px-4 py-2 text-sm hover:bg-[#333] transition-colors"
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/components/export/ExportButton.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/export/ExportButton.tsx src/components/export/ExportButton.test.tsx
git commit -m "feat: add ExportButton component with format dropdown"
```

---

### Task 5: Integrate Export Into Report Page + i18n

**Files:**
- Modify: `src/pages/Report.tsx`
- Modify: `src/locales/en.json`
- Modify: `src/locales/zh.json`
- Modify: `src/locales/ja.json`

- [ ] **Step 1: Add i18n keys**

Add to all three locale files:

```json
{
  "export.button": "Export",          // en
  "export.button": "导出",            // zh
  "export.button": "エクスポート"      // ja
}
```

- [ ] **Step 2: Add ExportButton to Report page header**

In `src/pages/Report.tsx`, import `ExportButton` and add it next to the back button in the header section:

```tsx
import { ExportButton } from '../components/export/ExportButton';

// In the header div, after the title, add:
<ExportButton
  sessions={sessions ?? []}
  title={`CC Statistics Report — ${selectedProject || 'All Projects'}`}
/>
```

- [ ] **Step 3: Verify in dev mode**

Run: `pnpm tauri dev`
Navigate to Report page, verify Export button appears with dropdown.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Report.tsx src/locales/en.json src/locales/zh.json src/locales/ja.json
git commit -m "feat: integrate data export into Report page"
```
