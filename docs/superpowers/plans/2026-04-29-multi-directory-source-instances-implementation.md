# Multi-Directory Source Instances Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable CC Statistics to aggregate one source from multiple configured directory roots, including default local roots, alternate same-source roots such as `.codex-one`, and directories synchronized from another machine.

**Architecture:** Introduce a first-class `source instance` configuration model shared by frontend settings and backend commands. Refactor source adapters to accept explicit root directories instead of assuming one `home_dir()`-derived location. Migrate shared aggregation identity from `source + session_id` to `source + instance_id + session_id`. Preserve current zero-config defaults by synthesizing built-in instances for standard paths. Land Codex and Claude first, then extend the shared instance pipeline to the remaining sources, then finish with export metadata, migration coverage, and app-level verification.

**Tech Stack:** Tauri 2, Rust, React 19, TypeScript, Zustand, TanStack Query, rusqlite, WalkDir, Vitest

---

## File Structure

| File | Responsibility |
|------|---------------|
| `docs/superpowers/specs/2026-04-29-multi-directory-source-instances-design.md` | Source-of-truth design spec |
| `src/stores/settingsStore.ts` | Persist source instance configuration and migrate existing settings |
| `src/components/pages/SettingsPage.tsx` | UI for managing built-in and custom source instances |
| `src/hooks/useStatistics.ts` | Send source instance configuration to backend commands |
| `src/types/statistics.ts` | Add instance metadata where needed for UI/export |
| `src/components/export/ExportButton.tsx` | No behavior change likely, but export consumers may surface new metadata |
| `src-tauri/src/models.rs` | Shared source instance request/response models |
| `src-tauri/src/commands.rs` | Accept source instance config and route through effective scan set |
| `src-tauri/src/aggregation.rs` | Group sessions by `source + instance_id + session_id` |
| `src-tauri/src/export.rs` | Add instance metadata columns to exports |
| `src-tauri/src/sources/mod.rs` | Shared source instance resolution and dispatch |
| `src-tauri/src/sources/claude.rs` | Accept explicit root path(s) for Claude |
| `src-tauri/src/sources/codex.rs` | Accept explicit root path(s) for Codex |
| `src-tauri/src/sources/gemini.rs` | Extend explicit root support after Codex/Claude baseline |
| `src-tauri/src/sources/opencode.rs` | Extend explicit root support after Codex/Claude baseline |
| `src-tauri/src/sources/openclaw.rs` | Extend explicit root support after Codex/Claude baseline |
| `src/components/pages/SettingsPage.test.tsx` | Settings instance management UI tests |
| `src/stores/updateStore.test.ts` or new store tests | Settings migration coverage if store tests are split |
| `src-tauri/tests/source_instances.rs` | Multi-instance backend coverage |
| `src-tauri/tests/export_instances.rs` or inline export tests | Export metadata regression coverage |

---

## Parallel Execution Lanes

Serial prerequisites:

1. Source instance data model and settings migration
2. Backend shared instance contract and aggregation identity change
3. Codex and Claude root-path refactors as the first supported multi-directory sources

After those land, run in parallel:

- Lane A: Settings UI for instance management
- Lane B: Export metadata updates and shared command plumbing
- Lane C: Gemini, OpenCode, and OpenClaw extension onto the same instance model

Final serial task:

- verification, migration checks, and smoke testing

---

### Task 1: Add Source Instance Data Model And Settings Migration

**Files:**
- Modify: `src/stores/settingsStore.ts`
- Modify: `src/components/pages/SettingsPage.tsx`
- Create or Modify: frontend tests covering settings migration and persistence

- [ ] **Step 1: Add failing frontend tests for settings migration**

Cover:

- existing persisted settings with only `enabledSources` migrate to synthesized built-in instances
- built-in instances are created for standard roots without requiring user edits
- custom instances persist with `id`, `source`, `label`, `rootPath`, `enabled`, and `builtIn`
- duplicate custom paths for the same source are rejected

- [ ] **Step 2: Run the targeted frontend tests and verify failure**

Run: `pnpm vitest src/components/pages/SettingsPage.test.tsx src/stores/updateStore.test.ts`

Expected: FAIL because source instance persistence and migration do not exist yet.

- [ ] **Step 3: Extend the settings store with source instance models**

Add a persisted structure similar to:

```ts
type SourceKind = 'claude_code' | 'codex' | 'gemini' | 'opencode' | 'openclaw';

interface SourceInstance {
  id: string;
  source: SourceKind;
  label: string;
  rootPath: string;
  enabled: boolean;
  builtIn: boolean;
}
```

Keep `enabledSources` as a coarse source-level gate during the transition.

- [ ] **Step 4: Implement migration from toggle-only settings**

Migration must:

- preserve current `enabledSources`
- synthesize built-in instances for the default roots
- mark them `builtIn: true`
- keep zero-config behavior unchanged for existing users

- [ ] **Step 5: Add store actions for custom source instances**

Add actions for:

- add custom instance
- update instance label
- update instance enabled state
- remove custom instance
- prevent duplicate root paths within the same source

- [ ] **Step 6: Re-run the targeted frontend tests**

Run: `pnpm vitest src/components/pages/SettingsPage.test.tsx src/stores/updateStore.test.ts`

Expected: PASS

- [ ] **Step 7: Commit the settings foundation**

```bash
git add src/stores/settingsStore.ts src/components/pages/SettingsPage.tsx
git commit -m "feat: add source instance settings model and migration"
```

---

### Task 2: Add Shared Backend Source Instance Contract

**Files:**
- Modify: `src-tauri/src/models.rs`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/sources/mod.rs`
- Create: `src-tauri/tests/source_instances.rs`

- [ ] **Step 1: Add failing Rust tests for multi-instance request handling**

Cover:

- built-in instance synthesis when no explicit instance list is provided
- filtering to enabled instances of enabled sources only
- invalid instance roots do not abort the full query
- effective scan set preserves source-kind ownership

- [ ] **Step 2: Run the targeted Rust tests and verify failure**

Run: `cargo test source_instances --manifest-path src-tauri/Cargo.toml`

Expected: FAIL because source instance request models and resolver logic do not exist yet.

- [ ] **Step 3: Add backend models for source instances**

Introduce shared models for:

- `SourceKind`
- `SourceInstanceConfig`
- validation/result status if needed

These models should be used by all command handlers that currently only receive `enabled_sources`.

- [ ] **Step 4: Implement shared effective scan set resolution**

In `src-tauri/src/sources/mod.rs`, add a resolver that:

- accepts source-level enablement plus instance list
- synthesizes built-in defaults if explicit instances are absent
- filters disabled sources and disabled instances
- returns per-source typed roots ready for adapter dispatch

- [ ] **Step 5: Update command handlers to accept source instance configuration**

Update:

- `get_projects`
- `get_statistics`
- `get_sessions`
- `get_instructions`
- `get_available_providers`
- `get_code_changes_detail`
- `get_account_usage` only if instance-aware account discovery is feasible now

Keep compatibility fallback for older callers during the migration window.

- [ ] **Step 6: Re-run the targeted Rust tests**

Run: `cargo test source_instances --manifest-path src-tauri/Cargo.toml`

Expected: PASS

- [ ] **Step 7: Commit the backend instance contract**

```bash
git add src-tauri/src/models.rs src-tauri/src/commands.rs src-tauri/src/sources/mod.rs src-tauri/tests/source_instances.rs
git commit -m "feat: add backend source instance contract"
```

---

### Task 3: Change Aggregation Identity To `source + instance_id + session_id`

**Files:**
- Modify: `src-tauri/src/aggregation.rs`
- Modify: `src-tauri/src/models.rs`
- Modify: `src/types/statistics.ts`
- Add or Modify: Rust aggregation tests

- [ ] **Step 1: Add failing aggregation tests for instance-aware grouping**

Cover:

- same `session_id` from two Codex instances becomes two sessions
- same `session_id` from two Claude instances becomes two sessions
- duration and instruction totals are computed independently per instance-backed session
- project totals still aggregate across instance boundaries

- [ ] **Step 2: Run the targeted Rust tests and verify failure**

Run: `cargo test shared_pipeline source_instances --manifest-path src-tauri/Cargo.toml`

Expected: FAIL because shared grouping still assumes `source + session_id`.

- [ ] **Step 3: Extend normalized records and session info with instance metadata**

Add:

- `instance_id`
- `instance_label`

Use `instance_id` as the authoritative grouping key.

- [ ] **Step 4: Update shared aggregation grouping**

Refactor grouping to:

- group by `source + instance_id + session_id`
- preserve `instance_label` for UI and export consumers

- [ ] **Step 5: Update TypeScript models only where surfaced**

Add instance metadata to frontend session/export types if used in views or exports, without forcing broad UI changes.

- [ ] **Step 6: Re-run the targeted tests**

Run: `cargo test shared_pipeline source_instances --manifest-path src-tauri/Cargo.toml`

Expected: PASS

- [ ] **Step 7: Commit instance-aware aggregation**

```bash
git add src-tauri/src/aggregation.rs src-tauri/src/models.rs src/types/statistics.ts
git commit -m "feat: make aggregation instance-aware"
```

---

### Task 4: Refactor Codex To Support Multiple Explicit Roots

**Files:**
- Modify: `src-tauri/src/sources/codex.rs`
- Modify: `src-tauri/src/session_reader.rs` if session detail lookup must become instance-aware
- Add or Modify: `src-tauri/tests/source_instances.rs`

- [ ] **Step 1: Add failing Codex multi-root tests**

Cover:

- project discovery from built-in `~/.codex`
- project discovery from custom root such as `~/.codex-one`
- session collection from multiple roots in one query
- SQLite fallback still works when present under the custom root

- [ ] **Step 2: Run the targeted Codex tests and verify failure**

Run: `cargo test codex source_instances --manifest-path src-tauri/Cargo.toml`

Expected: FAIL because Codex still assumes one `home_dir()` root.

- [ ] **Step 3: Extract root-aware Codex helpers**

Add explicit-root variants such as:

- `discover_projects_from_root(root: &Path)`
- `collect_normalized_sessions_from_root(root: &Path, ...)`
- `validate_root(root: &Path)`

Keep current home-derived wrappers for the built-in default root only.

- [ ] **Step 4: Make session detail lookup instance-aware if required**

If `get_session_messages` can collide across multiple roots, update lookup to include `instance_id` or an equivalent root-aware handle in the request path.

- [ ] **Step 5: Re-run the targeted Codex tests**

Run: `cargo test codex source_instances --manifest-path src-tauri/Cargo.toml`

Expected: PASS

- [ ] **Step 6: Commit multi-root Codex support**

```bash
git add src-tauri/src/sources/codex.rs src-tauri/src/session_reader.rs
git commit -m "feat: support multi-root codex instances"
```

---

### Task 5: Refactor Claude To Support Multiple Explicit Roots

**Files:**
- Modify: `src-tauri/src/sources/claude.rs`
- Modify: `src-tauri/src/parser.rs` only if project/session helpers need instance context
- Modify: `src-tauri/src/session_reader.rs` if Claude detail lookup must become instance-aware
- Add or Modify: Rust tests for Claude instance support

- [ ] **Step 1: Add failing Claude multi-root tests**

Cover:

- project discovery from built-in `~/.claude`
- project discovery from custom root such as `~/.claude-work`
- statistics aggregation across two Claude roots
- project directory mapping still works when multiple roots contain the same display name

- [ ] **Step 2: Run the targeted Claude tests and verify failure**

Run: `cargo test claude source_instances --manifest-path src-tauri/Cargo.toml`

Expected: FAIL because Claude still assumes `~/.claude/projects`.

- [ ] **Step 3: Extract root-aware Claude helpers**

Add explicit-root variants such as:

- `discover_projects_from_root(root: &Path)`
- `collect_stats_from_root(root: &Path, ...)`
- `collect_normalized_sessions_from_root(root: &Path, ...)`
- `validate_root(root: &Path)`

Treat the configured root as the Claude home, with sessions under `root/projects`.

- [ ] **Step 4: Make session detail lookup instance-aware if required**

If session detail retrieval can collide across multiple Claude roots, extend lookup to include instance context.

- [ ] **Step 5: Re-run the targeted Claude tests**

Run: `cargo test claude source_instances --manifest-path src-tauri/Cargo.toml`

Expected: PASS

- [ ] **Step 6: Commit multi-root Claude support**

```bash
git add src-tauri/src/sources/claude.rs src-tauri/src/parser.rs src-tauri/src/session_reader.rs
git commit -m "feat: support multi-root claude instances"
```

---

### Task 6: Build Settings UI For Source Instance Management

**Files:**
- Modify: `src/components/pages/SettingsPage.tsx`
- Modify: `src/components/pages/SettingsPage.test.tsx`
- Optionally create a small source-instance subcomponent if the page gets too large

- [ ] **Step 1: Add failing UI tests**

Cover:

- built-in instances render read-only root paths
- custom instance can be added for Codex with label and path
- custom instance can be toggled enabled/disabled
- duplicate path shows validation feedback
- custom instance can be removed

- [ ] **Step 2: Run the targeted UI tests and verify failure**

Run: `pnpm vitest src/components/pages/SettingsPage.test.tsx`

Expected: FAIL because the UI does not expose source instance management.

- [ ] **Step 3: Add a source instance management section**

For each source:

- show built-in instance row
- show custom instances
- allow add/edit/remove of custom rows
- expose validation state
- preserve the existing source-level enable toggle

- [ ] **Step 4: Keep the UI minimal and non-disruptive**

Do not add a new top-bar filter.

Place this under Settings, ideally in the advanced/data-source area.

- [ ] **Step 5: Re-run the targeted UI tests**

Run: `pnpm vitest src/components/pages/SettingsPage.test.tsx`

Expected: PASS

- [ ] **Step 6: Commit the settings UI**

```bash
git add src/components/pages/SettingsPage.tsx src/components/pages/SettingsPage.test.tsx
git commit -m "feat: add source instance management ui"
```

---

### Task 7: Send Source Instance Config Through Frontend Data Hooks

**Files:**
- Modify: `src/hooks/useStatistics.ts`
- Modify: `src/types/statistics.ts`
- Modify: any affected page tests mocking Tauri invoke payloads

- [ ] **Step 1: Add failing hook or page tests**

Cover:

- statistics queries include source instance configuration
- sessions queries include source instance configuration
- projects and instructions queries include source instance configuration
- old behavior remains intact when only built-in synthesized instances exist

- [ ] **Step 2: Run the targeted frontend tests and verify failure**

Run: `pnpm vitest src/pages/cost-pages.test.tsx src/components/export/ExportButton.test.tsx`

Expected: FAIL where mocked invoke payloads no longer match the new contract.

- [ ] **Step 3: Update hooks to pass source instances**

Read source instances from the settings store and include them in all relevant `invoke(...)` calls.

- [ ] **Step 4: Re-run the targeted frontend tests**

Run: `pnpm vitest src/pages/cost-pages.test.tsx src/components/export/ExportButton.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit frontend command plumbing**

```bash
git add src/hooks/useStatistics.ts src/types/statistics.ts
git commit -m "feat: send source instances through frontend data hooks"
```

---

### Task 8: Add Instance Metadata To Exports And Session Surfaces

**Files:**
- Modify: `src-tauri/src/export.rs`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src/components/export/ExportButton.tsx` only if labels or filenames need changes
- Add or Modify: export formatter tests

- [ ] **Step 1: Add failing export tests**

Cover:

- CSV includes instance label column
- JSON includes instance metadata fields
- Markdown includes instance label in session rows or a clearly documented alternative

- [ ] **Step 2: Run the targeted export tests and verify failure**

Run: `cargo test export --manifest-path src-tauri/Cargo.toml`

Expected: FAIL because export rows do not include instance metadata.

- [ ] **Step 3: Extend export row models**

Add:

- `instance_id`
- `instance_label`

Optionally include `root_path` only if privacy/product concerns are resolved. Default to label-first exposure.

- [ ] **Step 4: Update export commands and formatters**

Ensure every exported session row carries enough instance context for users to understand which machine/profile/root contributed it.

- [ ] **Step 5: Re-run the targeted export tests**

Run: `cargo test export --manifest-path src-tauri/Cargo.toml`

Expected: PASS

- [ ] **Step 6: Commit export metadata support**

```bash
git add src-tauri/src/export.rs src-tauri/src/commands.rs
git commit -m "feat: add instance metadata to exports"
```

---

### Task 9: Extend The Shared Instance Model To Gemini, OpenCode, And OpenClaw

**Files:**
- Modify: `src-tauri/src/sources/gemini.rs`
- Modify: `src-tauri/src/sources/opencode.rs`
- Modify: `src-tauri/src/sources/openclaw.rs`
- Modify: shared backend tests as needed

- [ ] **Step 1: Add failing tests or fixtures per remaining source**

Cover:

- explicit root validation
- explicit root project discovery
- normalized session collection from explicit roots

- [ ] **Step 2: Run the targeted Rust tests and verify failure**

Run: `cargo test gemini opencode openclaw source_instances --manifest-path src-tauri/Cargo.toml`

Expected: FAIL because these sources still assume hard-coded roots.

- [ ] **Step 3: Refactor each remaining source to accept explicit roots**

Keep the root contract source-specific:

- Gemini root is the `.gemini` home
- OpenCode root is the parent directory containing `opencode.db`
- OpenClaw root is the `.openclaw` home

- [ ] **Step 4: Re-run the targeted Rust tests**

Run: `cargo test gemini opencode openclaw source_instances --manifest-path src-tauri/Cargo.toml`

Expected: PASS

- [ ] **Step 5: Commit remaining source support**

```bash
git add src-tauri/src/sources/gemini.rs src-tauri/src/sources/opencode.rs src-tauri/src/sources/openclaw.rs
git commit -m "feat: extend source instance support to remaining adapters"
```

---

### Task 10: Verification, Migration Checks, And Smoke Testing

**Files:**
- Modify: any remaining tests or docs discovered during verification

- [ ] **Step 1: Run backend test suites**

Run:

- `cargo test --manifest-path src-tauri/Cargo.toml`

- [ ] **Step 2: Run frontend test suites**

Run:

- `pnpm vitest`

- [ ] **Step 3: Run type and build verification**

Run:

- `pnpm typecheck`
- `pnpm build`

- [ ] **Step 4: Perform manual smoke checks**

Verify in the app:

- existing users still see default-path data without configuring custom instances
- a second Codex root such as `.codex-one` can be added and contributes data
- a second Claude root such as `.claude-work` can be added and contributes data
- disabling one instance removes only that instance's contribution
- exports include instance metadata
- session details still open the correct underlying session when duplicate `session_id` values exist across instances

- [ ] **Step 5: Document residual risks**

Call out any deferred work such as:

- exact mirrored-directory deduplication
- account usage behavior for custom roots
- privacy decision on exporting full root paths

- [ ] **Step 6: Commit final verification fixes**

```bash
git add .
git commit -m "test: verify multi-directory source instances end to end"
```

---

## Recommended Execution Order

1. Task 1
2. Task 2
3. Task 3
4. Task 4
5. Task 5
6. Task 6 and Task 7 in either order
7. Task 8
8. Task 9
9. Task 10

---

## Acceptance Criteria

- Existing users retain current behavior with default built-in roots and no manual setup.
- Users can add extra Codex roots such as `~/.codex-one` and see merged statistics.
- Users can add extra Claude roots such as `~/.claude-work` and see merged statistics.
- Users can add a locally synced Linux source root on Mac and have it aggregate with local roots.
- Session identity is instance-aware, so duplicate session ids across roots are not merged incorrectly.
- Invalid instance roots are surfaced in Settings and skipped safely during queries.
- Exports include enough instance metadata to explain where each session row came from.
