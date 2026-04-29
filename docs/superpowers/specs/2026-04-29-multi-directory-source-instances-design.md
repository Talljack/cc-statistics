# Multi-Directory Source Instances Design

Date: 2026-04-29
Project: CC Statistics
Status: Proposed

## Goal

Allow one enabled source to read from multiple local directories instead of one hard-coded home path.

This must support:

- the default local directories such as `~/.codex` and `~/.claude`
- alternate same-source directories such as `~/.codex-one`, `~/.codex-work`, `~/.claude-alt`
- directories synchronized from another machine such as a Linux export mirrored onto a Mac
- aggregation across all configured directories in one unified statistics view

The resulting app must let a user combine activity from multiple source instances without manually merging exported reports.

## Problem

Today the app reads each source from one implicit home-based location only.

Examples in the current implementation:

- Claude Code reads from `~/.claude/projects`
- Codex reads from `~/.codex/sessions` and `~/.codex/state_5.sqlite`
- OpenCode reads from `~/.local/share/opencode/opencode.db`

That means the app cannot correctly aggregate:

- multiple installations or profiles of the same tool on one machine
- user-managed alternate directories such as `.codex-one`
- data mirrored from another machine into a local sync folder

As a result, a user with active work split across Mac and Linux, or across multiple local CLI profiles, sees only a partial total.

## Goals

- support multiple configured directories per source
- preserve current zero-config behavior for default paths
- support alternate same-source directories like `.codex-one` and `.claude-foo`
- support cross-device aggregation when another machine's source directory is synced locally
- keep all pages and exports aggregating from the same effective directory set
- avoid session collisions when the same `session_id` exists in different directories

## Non-Goals

- adding cloud sync managed by this app
- writing into source directories
- bi-directional replication between machines
- changing top-bar project/provider/time-range filters
- adding a new top-bar instance selector in this phase

## Product Rules

### Source Instances

A source is the product-level tool type:

- `claude_code`
- `codex`
- `gemini`
- `opencode`
- `openclaw`

A source instance is one configured directory root for that source.

Examples:

- source `codex`, instance root `~/.codex`
- source `codex`, instance root `~/.codex-one`
- source `claude_code`, instance root `~/Syncthing/linux-home/.claude`

The app aggregates across all enabled instances of all enabled sources.

### Default Behavior

Out of the box, the app must keep the current behavior by auto-registering one built-in instance per source when the default path exists.

Examples:

- Claude Code default instance root: `~/.claude`
- Codex default instance root: `~/.codex`
- Gemini default instance root: `~/.gemini`
- OpenCode default instance root: `~/.local/share/opencode`
- OpenClaw default instance root: `~/.openclaw`

Users do not need to configure anything to preserve today's experience.

### Custom Instance Directories

Users may add zero or more extra instance directories for each source.

Examples:

- add `~/.codex-one` as another `codex` instance
- add `~/.claude-work` as another `claude_code` instance
- add `/Volumes/data/linux-home/.codex` as another `codex` instance

Custom instance directories must be source-typed explicitly by the user. The app must not guess that `.codex-one` is Codex only from its name.

### Instance Identity

Session identity must no longer be only `source + session_id`.

It must become:

- `source + instance_id + session_id`

where `instance_id` is a stable app-owned identifier for one configured source instance.

This prevents collisions when:

- two Codex directories contain the same session filename
- two Claude directories contain the same project/session identifier
- a synced copy duplicates a session id namespace from another machine

### Deduplication

The app must not blindly deduplicate sessions only because `session_id` matches.

Default rule:

- sessions from different `instance_id` values are treated as different sessions

Optional future enhancement:

- content-level deduplication for mirrored copies of the exact same directory

That enhancement is explicitly out of scope for this phase because it requires a stronger identity contract than current sources provide.

### Effective Scan Set

For each enabled source, the effective scan set is:

- built-in default instance if present and enabled
- all custom instances for that source that are enabled and valid

All backend statistics, sessions, instructions, code changes, account pages, and exports must consume the same effective scan set.

### UI Exposure

Settings becomes the only place where source instances are managed.

The top bar remains unchanged.

This phase does not add:

- an instance filter
- a machine filter
- an alternate aggregation mode selector

## Directory Contracts

### Source Root Convention

Each source adapter must accept an explicit source root and derive its data files relative to that root.

Examples:

- Claude Code instance root `X` maps to sessions under `X/projects`
- Codex instance root `X` maps to `X/sessions` and optional SQLite files in `X/`
- Gemini instance root `X` maps to `X/history` and `X/tmp`
- OpenCode instance root `X` maps to `X/opencode.db` when `X` is the current parent directory
- OpenClaw instance root `X` maps to `X/agents/main/sessions`

The root contract must be documented and validated per source instead of hard-coding `dirs::home_dir()` in parsing paths.

### Validation

When a user adds a custom instance directory, the app must validate it against the selected source.

Validation should confirm the presence of source-specific markers.

Examples:

- Codex: `sessions/` or `state_5.sqlite`
- Claude Code: `projects/`
- OpenCode: `opencode.db`

Validation must return a user-facing status:

- valid
- missing
- unreadable
- wrong shape for selected source

### Path Safety

The app remains read-only.

It must never mutate:

- synced directories
- live CLI SQLite files
- copied session logs

## Data Model Changes

### Frontend Settings State

Replace the current source toggle-only model with a source toggle plus a source instance list.

Representative shape:

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

`enabledSources` may remain as a coarse source-level gate, but source-level enablement should work together with instance-level enablement:

- source disabled: no instances contribute
- source enabled: only enabled instances contribute

### Backend Request Contract

Backend commands that currently receive `enabled_sources` must also receive resolved source instance configuration.

Representative command input:

- enabled source kinds
- source instance list

The backend must not reread UI persistence files directly.

### Normalized Records

All normalized records must carry:

- `source`
- `instance_id`
- `instance_label`
- `session_id`
- `timestamp`
- `project`
- `provider`

`instance_label` is informational for UI/debug/export.

`instance_id` is authoritative for grouping identity.

## Aggregation Changes

### Session Grouping

Shared aggregation must group by:

- `source + instance_id + session_id`

not by `source + session_id`.

This applies to:

- statistics totals
- session list
- duration calculation
- instruction counts
- code change rollups
- exports

### Project Aggregation

Project names may collide across instances and machines.

That is acceptable.

Project-level totals continue to aggregate by displayed project name, but every contributing record still retains its source and instance context.

### Exports

Report export rows should add instance metadata so users can audit where a row came from.

Recommended new fields:

- `instance_id`
- `instance_label`
- `root_path` or a redacted display variant

At minimum, exports must include a human-readable instance label.

## UI Changes

### Settings

Add a source instance management section under Settings.

For each source:

- show the built-in default instance
- show custom instances
- allow enable/disable per instance
- allow add custom instance
- allow edit label
- allow remove custom instance
- show validation state

Recommended presentation:

- source card
- built-in instance pinned at top
- custom instance rows beneath

### Labels

Users need a friendly label because raw paths are noisy.

Examples:

- `Mac Default`
- `Linux Sync`
- `Work Profile`
- `Personal`

The app should prefill a label from the basename when first adding a custom instance, but the label remains user-editable.

### Discovery Assistance

The app may offer a lightweight helper for common sibling directories, but it must not auto-add them silently.

Example helper behavior:

- detect `~/.codex-*`
- present them as suggested Codex instances
- let the user confirm before adding

This helper is optional in this phase.

## Backend Architecture

### Source Adapter Refactor

Each source module must stop resolving its root exclusively from `dirs::home_dir()`.

Instead, each source module should expose functions that operate on explicit roots.

Examples:

- `collect_normalized_sessions_from_root(root: &Path, ...)`
- `discover_projects_from_root(root: &Path, ...)`
- `validate_root(root: &Path) -> ValidationResult`

The current home-derived helpers can remain as wrappers for the built-in default instance only.

### Shared Source Instance Resolver

Introduce one shared backend layer that:

- receives configured source instances from the frontend
- filters to enabled instances of enabled sources
- validates and normalizes paths
- dispatches each instance to the correct source adapter

This layer becomes the authoritative producer of the effective scan set.

### Built-In Instance Synthesis

If the frontend has no persisted custom instances yet, built-in defaults should still appear as synthesized instances so the rest of the pipeline always works against one unified instance model.

## Cross-Device Workflow

This feature is intentionally local-first.

The supported cross-device pattern is:

1. sync or mount another machine's source directory onto the current machine
2. add that synced directory as a custom source instance
3. let CC Statistics aggregate it with local instances

Example:

1. Linux `~/.codex` is mirrored to `~/Syncthing/linux-home/.codex` on Mac
2. user adds that path as source `codex`
3. app aggregates local `~/.codex` and synced `~/Syncthing/linux-home/.codex`

The app does not own step 1.

## Edge Cases

- If a configured path disappears, the app should mark the instance invalid and skip it without failing the whole query.
- If an instance contains no readable activity, it should contribute nothing but remain configured.
- If two instances point to the same root path, the app should prevent saving the duplicate.
- If one root path is nested inside another for the same source, the app should warn because duplicate scanning is likely.
- If a synced directory contains stale partial data, the app should surface only whatever valid sessions are readable; it should not invent completion state.
- If one source stores account metadata in one file and sessions in another, missing one component should degrade only the affected features.

## Migration

### Settings Migration

Existing persisted settings must migrate safely.

Migration behavior:

- preserve current `enabledSources`
- create synthesized built-in instances for existing enabled sources
- mark them `builtIn: true`
- initialize labels such as `Default`

No user action should be required to preserve today's functionality after upgrading.

### Backend Compatibility

During migration, backend commands may accept missing instance configuration and synthesize built-in defaults server-side as a compatibility fallback.

That fallback should be temporary. The long-term contract should be explicit instance lists from the frontend.

## Testing

### Backend Tests

Add coverage for:

- source root validation per source
- collecting from multiple Codex roots
- collecting from multiple Claude roots
- grouping by `source + instance_id + session_id`
- preserving separate sessions when `session_id` collides across instances
- skipping invalid or unreadable instances without aborting all aggregation

### Frontend Tests

Add coverage for:

- settings migration from old source toggles to built-in instances
- add/edit/remove custom instance flows
- per-instance enablement
- duplicate path prevention
- validation error display

### Regression Coverage

Verify that all existing pages still work when:

- only built-in default instances exist
- one source has two instances
- multiple sources each have multiple instances

## Files Expected To Change

- `src/stores/settingsStore.ts`
- `src/components/pages/SettingsPage.tsx`
- `src/hooks/useStatistics.ts`
- `src/types/statistics.ts` if export/session metadata expands
- `src-tauri/src/sources/mod.rs`
- `src-tauri/src/sources/claude.rs`
- `src-tauri/src/sources/codex.rs`
- `src-tauri/src/sources/gemini.rs`
- `src-tauri/src/sources/opencode.rs`
- `src-tauri/src/sources/openclaw.rs`
- `src-tauri/src/commands.rs`
- `src-tauri/src/aggregation.rs`
- `src-tauri/src/export.rs`

## Acceptance Criteria

- A user can keep using the app without configuring anything and still get current default-path behavior.
- A user can add `~/.codex-one` as a second Codex instance and see merged statistics.
- A user can add an alternate Claude root such as `~/.claude-work` and see merged statistics.
- A user can add a locally synced Linux directory as another instance and see its data aggregated with local data.
- Session collisions across different instance directories do not overwrite or merge each other incorrectly.
- Invalid custom paths do not crash queries and are clearly marked in Settings.
- Report exports include enough instance metadata to explain where each row came from.
