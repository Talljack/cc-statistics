# Code Changes Diff Detail Page — Design Spec

## Overview

Add a detail page for code changes that shows per-file diffs with Unified and Side-by-side views. Users click the "代码变更" card on Dashboard to navigate to `/code-changes`, where they see a file list with expandable diff content — green for additions, red for deletions, like a code editor.

## Data Layer (Rust Backend)

### New Data Models

```rust
// models.rs

pub struct FileChange {
    pub file_path: String,
    pub extension: String,
    pub change_type: String,        // "create" | "edit"
    pub additions: u32,
    pub deletions: u32,
    pub diff_content: Option<DiffContent>,
}

pub enum DiffContent {
    Patch(Vec<DiffLine>),                   // from structuredPatch
    TextPair { old: String, new: String },  // from oldString/newString
    Created(String),                        // from create content
}

pub struct DiffLine {
    pub kind: String,  // "add" | "remove" | "context"
    pub content: String,
}
```

### Parser Changes (`parser.rs`)

In `extract_tool_result_code_changes`, beyond the existing line count stats, preserve raw diff data:

- `structuredPatch` array → parse each line into `DiffLine` with kind (add/remove/context) and content → `DiffContent::Patch`
- `oldString` / `newString` (or `originalFile`) → store raw text → `DiffContent::TextPair`
- `create` type with `content` → store full text → `DiffContent::Created`

Size limits at the Rust level:
- Single file `oldString/newString` exceeding 50KB → drop text, fallback to stats only
- `structuredPatch` exceeding 1000 lines → truncate

### New IPC Command

```rust
#[tauri::command]
pub async fn get_code_changes_detail(
    project: Option<String>,
    time_filter: String,
    time_range: Option<QueryTimeRange>,
    provider_filter: Option<String>,
    custom_providers: Option<Vec<CustomProviderDef>>,
    enabled_sources: Option<SourceConfig>,
) -> Result<Vec<FileChange>, String>
```

On-demand call — does NOT affect Dashboard's `get_statistics`. Uses `spawn_blocking` like other heavy commands.

### Aggregation

New function `aggregate_code_changes_detail` that collects `FileChange` records from all matching sessions, grouped by file path. If the same file appears in multiple sessions, each occurrence is a separate entry (preserving per-session context).

## Frontend

### Route

New route `/code-changes` in `App.tsx`.

### Page Structure

```
CodeChangesDetail page
├── Header (reuse existing)
├── Back button + title "代码变更详情"
├── Summary bar (4 metrics: files / additions / deletions / net)
├── Toolbar: search input + Unified/Side-by-side toggle
├── File list (collapsible accordion)
│   ├── File row: icon + path + extension tag + +N/-N stats
│   └── Expanded: Diff view
│       ├── Unified: green lines (+) / red lines (-) / gray (context)
│       └── Side-by-side: left=old, right=new, aligned line numbers
```

### Diff Rendering Logic

| DiffContent variant | Rendering |
|---|---|
| `Patch(lines)` | Render diff lines directly with line numbers and colors |
| `TextPair { old, new }` | Frontend does simple line-by-line LCS diff to generate add/remove lines |
| `Created(content)` | All lines shown as green additions |
| `None` | Show `+N/-N` stats + "diff content unavailable" message |

### Interactions

- File list defaults to all collapsed; click to expand diff
- Search box filters by file path
- Unified / Side-by-side toggle applies globally
- Files sorted by directory grouping (files in same directory stay together)

### Entry Point

Dashboard `CodeChanges` component gets an `onClick` → `navigate('/code-changes')`. Follows the same pattern as Sessions, Instructions, Cost cards.

## Performance

- **On-demand loading**: `get_code_changes_detail` called only when entering detail page
- **Virtual scrolling**: for >50 files, use virtual scrolling to limit DOM nodes
- **Lazy diff rendering**: collapsed files do not render diff content
- **Large file truncation**: single file diff >500 lines is truncated with "showing first 500 of N lines"

## Edge Cases

- **No diff data**: file has stats but no raw content → show stats + "diff 内容不可用"
- **Binary files**: skip, show filename + "Binary file changed"
- **Zero changes**: files with additions=0 and deletions=0 are hidden
- **TextPair frontend diff**: simple LCS line comparison, no third-party diff library

## Files to Change

### Rust (backend)
- `src-tauri/src/models.rs` — add `FileChange`, `DiffContent`, `DiffLine` structs
- `src-tauri/src/normalized.rs` — extend `CodeChangeRecord` with `diff_content` field
- `src-tauri/src/parser.rs` — preserve raw diff data in `extract_tool_result_code_changes`
- `src-tauri/src/aggregation.rs` — add `aggregate_code_changes_detail` function
- `src-tauri/src/commands.rs` — add `get_code_changes_detail` command
- `src-tauri/src/lib.rs` — register new command

### TypeScript (frontend)
- `src/types/statistics.ts` — add `FileChange`, `DiffContent`, `DiffLine` interfaces
- `src/hooks/useStatistics.ts` — add `useCodeChangesDetail` hook
- `src/pages/CodeChangesDetail.tsx` — new page component
- `src/components/diff/UnifiedDiff.tsx` — Unified diff renderer
- `src/components/diff/SideBySideDiff.tsx` — Side-by-side diff renderer
- `src/components/diff/DiffFileList.tsx` — file list with accordion
- `src/components/charts/CodeChanges.tsx` — add onClick navigate
- `src/App.tsx` — add `/code-changes` route
- `src/locales/{en,zh,ja}.json` — add translations
