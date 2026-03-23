# Multi-Source Unified Statistics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor CC Statistics so all enabled sources participate in one unified, record-level filtered statistics pipeline with consistent support for sessions, instructions, duration, tokens, cost, tools, skills, MCP, and Claude-compatible code changes.

**Architecture:** Introduce a shared normalized-record layer plus a shared aggregator in the Tauri backend, then migrate Claude, Codex, Gemini, OpenCode, and OpenClaw adapters onto that pipeline. Keep the top-bar filter model unchanged, let Settings continue to control which sources are active, and make every page consume the same filtered aggregate results. Build the shared foundation serially, run source migrations in parallel with disjoint write scopes, then finish with frontend parity, verification, build, and app-level smoke tests.

**Tech Stack:** Tauri 2, Rust, Chrono, WalkDir, rusqlite, React 19, TypeScript, Zustand, TanStack Query, Vitest, agent-browser

---

## File Structure

- Create: `src-tauri/src/normalized.rs`
- Create: `src-tauri/src/classification.rs`
- Create: `src-tauri/src/aggregation.rs`
- Create: `src-tauri/tests/record_time_filters.rs`
- Create: `src-tauri/tests/classification_rules.rs`
- Create: `src-tauri/tests/claude_shared_pipeline.rs`
- Create: `src-tauri/tests/codex_gemini_shared_pipeline.rs`
- Create: `src-tauri/tests/opencode_openclaw_shared_pipeline.rs`
- Create: `src-tauri/tests/absolute_range_regression.rs`
- Create: `src/lib/unifiedStatistics.test.ts`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/models.rs`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/time_ranges.rs`
- Modify: `src-tauri/src/parser.rs`
- Modify: `src-tauri/src/sources/claude.rs`
- Modify: `src-tauri/src/sources/codex.rs`
- Modify: `src-tauri/src/sources/gemini.rs`
- Modify: `src-tauri/src/sources/opencode.rs`
- Modify: `src-tauri/src/sources/openclaw.rs`
- Modify: `src-tauri/src/sources/mod.rs`
- Modify: `src/types/statistics.ts`
- Modify: `src/hooks/useStatistics.ts`
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/pages/Skills.tsx`
- Modify: `src/pages/McpServers.tsx`
- Modify: `src/pages/Sessions.tsx`
- Modify: `src/pages/Instructions.tsx`
- Modify: `src/pages/Report.tsx`
- Modify: `package.json`

## Parallel Execution Lanes

Serial prerequisites:

1. Shared normalized record contract and record-level time filter helpers
2. Shared skill/MCP classification rules
3. Shared aggregator and command plumbing
4. Claude migration to the shared pipeline as the baseline reference

After those land, run in parallel:

- Lane A: Codex + Gemini adapter migration
- Lane B: OpenCode + OpenClaw adapter migration
- Lane C: Frontend type updates, instruction/source display, and shared page parity

Final serial task:

- Verification, build, and app-level smoke testing

### Task 1: Add Shared Normalized Record Contracts And Record-Level Time Filters

**Files:**
- Create: `src-tauri/src/normalized.rs`
- Create: `src-tauri/tests/record_time_filters.rs`
- Create: `src-tauri/tests/absolute_range_regression.rs`
- Modify: `src-tauri/src/models.rs`
- Modify: `src-tauri/src/time_ranges.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add failing Rust tests for record-level range inclusion**

Write tests that prove:

- a record inside an absolute range is included
- a record outside the same absolute range is excluded even if its file would pass coarse filtering
- relative and built-in ranges are evaluated from record timestamps rather than file mtimes

- [ ] **Step 2: Run the new Rust tests and verify failure**

Run: `cargo test record_time_filters absolute_range_regression --manifest-path src-tauri/Cargo.toml`

Expected: FAIL because the normalized record model and record-level helper functions do not exist yet.

- [ ] **Step 3: Implement the shared normalized record model**

Add a backend module that defines:

- a `NormalizedRecord` enum or equivalent record family
- shared fields: `source`, `session_id`, `timestamp`, `project`, `provider`
- record payloads for instructions, tokens, tools, skills, MCP, code changes, and session metadata
- normalized token payloads that explicitly include `cost_usd`

Keep source capability gaps explicit by representing unsupported contributions as no record or zero-valued normalized payload, not heuristics.

- [ ] **Step 4: Implement shared record-level time helpers**

Add helpers that:

- convert `QueryTimeRange` into record predicates
- evaluate `Today`, `Week`, `Month`, relative, and absolute ranges against record timestamps
- keep file mtime as an optional coarse scan optimization only

- [ ] **Step 5: Wire the new modules into the Tauri backend**

Register the new Rust modules from `src-tauri/src/lib.rs` and extend models only where the normalized pipeline needs new response fields later, without breaking existing command signatures yet.

- [ ] **Step 6: Re-run the targeted Rust tests**

Run: `cargo test record_time_filters absolute_range_regression --manifest-path src-tauri/Cargo.toml`

Expected: PASS

- [ ] **Step 7: Commit the foundation contract**

```bash
git add src-tauri/src/lib.rs src-tauri/src/models.rs src-tauri/src/time_ranges.rs src-tauri/src/normalized.rs src-tauri/tests/record_time_filters.rs src-tauri/tests/absolute_range_regression.rs
git commit -m "feat: add normalized record contract and record-level time filters"
```

### Task 2: Add Shared Skill And MCP Classification Rules

**Files:**
- Create: `src-tauri/src/classification.rs`
- Create: `src-tauri/tests/classification_rules.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add failing rule-module tests**

Write tests that prove:

- Claude `tool_use.name == "Skill"` is recognized as a skill event
- explicit MCP-shaped names or structures are recognized as MCP
- a plain tool call is not promoted to skill without satisfying the full rule set
- source-specific whitelist matches are centralized and deterministic

- [ ] **Step 2: Run the rule-module tests and verify failure**

Run: `cargo test classification_rules --manifest-path src-tauri/Cargo.toml`

Expected: FAIL because the shared classification module does not exist yet.

- [ ] **Step 3: Implement the centralized classification module**

Add a shared Rust module that owns:

- skill classification helpers
- MCP classification helpers
- source-specific whitelist tables
- stable, testable classification entry points used by all non-Claude adapters

Do not scatter rule logic across source parsers once this module exists.

- [ ] **Step 4: Wire the module into the backend**

Expose the module from `src-tauri/src/lib.rs` and make it available to all source adapters and the Claude baseline path.

- [ ] **Step 5: Re-run the rule-module tests**

Run: `cargo test classification_rules --manifest-path src-tauri/Cargo.toml`

Expected: PASS

- [ ] **Step 6: Commit the shared classification rules**

```bash
git add src-tauri/src/lib.rs src-tauri/src/classification.rs src-tauri/tests/classification_rules.rs
git commit -m "feat: add centralized skill and mcp classification rules"
```

### Task 3: Add Shared Aggregator And Command Plumbing

**Files:**
- Create: `src-tauri/src/aggregation.rs`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/models.rs`
- Modify: `src-tauri/src/sources/mod.rs`

- [ ] **Step 1: Add failing aggregation tests for sessions, duration, and counters**

Write tests that prove the shared aggregator:

- counts a session when at least one filtered record remains
- excludes zero-duration sessions from duration totals
- aggregates `tool_usage`, `skill_usage`, `mcp_usage`, token totals, `cost_usd`, and code changes from the same filtered record set

- [ ] **Step 2: Run the aggregation tests and verify failure**

Run: `cargo test shared_pipeline --manifest-path src-tauri/Cargo.toml`

Expected: FAIL because the shared aggregator does not exist yet.

- [ ] **Step 3: Implement the shared aggregator**

Add an aggregator that:

- groups normalized records by `source + session_id`
- calculates session count and duration using filtered records only
- emits `Statistics`, `SessionInfo`, and `InstructionInfo`
- applies `enabled_sources`, project, provider, and time-range filters in one place

- [ ] **Step 4: Add a compatibility extraction contract for all sources**

Before switching command handlers, add a shared source adapter contract so every source module compiles against the normalized pipeline shape:

- a common function name or trait for normalized-session extraction
- temporary compatibility wrappers for sources not yet fully migrated
- no midway state where non-Claude sources silently disappear from results

- [ ] **Step 5: Move command handlers to the shared aggregator path**

Update `get_statistics`, `get_sessions`, `get_instructions`, and `get_available_providers` so they consume normalized records from enabled sources instead of source-specific pre-aggregated session totals.

- [ ] **Step 6: Preserve current frontend response shape where possible**

Keep existing response contracts stable unless a new field is explicitly needed, so frontend breakage is minimized while the backend path changes underneath.

- [ ] **Step 7: Re-run the aggregation tests**

Run: `cargo test shared_pipeline --manifest-path src-tauri/Cargo.toml`

Expected: PASS

- [ ] **Step 8: Commit the shared aggregation layer**

```bash
git add src-tauri/src/aggregation.rs src-tauri/src/commands.rs src-tauri/src/models.rs src-tauri/src/sources/mod.rs
git commit -m "feat: route statistics commands through shared aggregator"
```

### Task 4: Migrate Claude To The Shared Pipeline Baseline

**Files:**
- Create: `src-tauri/tests/claude_shared_pipeline.rs`
- Modify: `src-tauri/src/parser.rs`
- Modify: `src-tauri/src/sources/claude.rs`

- [ ] **Step 1: Add failing Claude baseline tests**

Cover:

- `tool_use.name == "Skill"` increments both tool and skill usage
- `mcp__*` increments both tool and MCP usage
- code changes keep the current Claude semantics
- absolute ranges only count Claude records inside the selected date window

- [ ] **Step 2: Run the Claude tests and verify failure**

Run: `cargo test claude_shared_pipeline --manifest-path src-tauri/Cargo.toml`

Expected: FAIL because Claude still feeds the old session-centric path.

- [ ] **Step 3: Refactor Claude parsing to emit normalized records**

Keep the existing patch parsing and token extraction logic, but shift the output from ad hoc session totals toward normalized records consumed by the shared aggregator.

- [ ] **Step 4: Remove duplicate Claude-side filtering logic that conflicts with record-level filtering**

Keep only safe coarse pre-filters. Final inclusion must be decided by normalized record timestamps.

- [ ] **Step 5: Re-run the Claude tests**

Run: `cargo test claude_shared_pipeline --manifest-path src-tauri/Cargo.toml`

Expected: PASS

- [ ] **Step 6: Commit the Claude baseline migration**

```bash
git add src-tauri/src/parser.rs src-tauri/src/sources/claude.rs src-tauri/tests/claude_shared_pipeline.rs
git commit -m "refactor: migrate claude source to shared statistics pipeline"
```

### Task 5: Migrate Codex And Gemini To The Shared Pipeline

**Files:**
- Create: `src-tauri/tests/codex_gemini_shared_pipeline.rs`
- Modify: `src-tauri/src/sources/codex.rs`
- Modify: `src-tauri/src/sources/gemini.rs`

- [ ] **Step 1: Add failing Codex and Gemini parity tests**

Cover:

- instruction extraction
- token normalization
- session counting and duration semantics
- explicit skill detection or zero contribution if no reliable equivalent exists
- MCP detection when structure is explicit, otherwise ordinary tool only

- [ ] **Step 2: Run the Codex/Gemini tests and verify failure**

Run: `cargo test codex_gemini_shared_pipeline --manifest-path src-tauri/Cargo.toml`

Expected: FAIL because both sources still aggregate locally.

- [ ] **Step 3: Refactor Codex into normalized record output**

Move Codex parsing to emit:

- instruction records from user-originated entries
- token records from cumulative token events
- tool/MCP/skill records based on explicit structures first, then strict whitelist rules only if justified

- [ ] **Step 4: Refactor Gemini into normalized record output**

Apply the same pipeline conventions:

- record-level timestamp filtering
- no file-mtime-only final decisions
- zero contribution when a metric cannot be supported reliably

- [ ] **Step 5: Re-run the Codex/Gemini tests**

Run: `cargo test codex_gemini_shared_pipeline --manifest-path src-tauri/Cargo.toml`

Expected: PASS

- [ ] **Step 6: Commit the Codex/Gemini migration**

```bash
git add src-tauri/src/sources/codex.rs src-tauri/src/sources/gemini.rs src-tauri/tests/codex_gemini_shared_pipeline.rs
git commit -m "feat: migrate codex and gemini sources to shared pipeline"
```

### Task 6: Migrate OpenCode And OpenClaw To The Shared Pipeline

**Files:**
- Create: `src-tauri/tests/opencode_openclaw_shared_pipeline.rs`
- Modify: `src-tauri/src/sources/opencode.rs`
- Modify: `src-tauri/src/sources/openclaw.rs`

- [ ] **Step 1: Add failing OpenCode and OpenClaw parity tests**

Cover:

- session and duration semantics under record-level filtering
- token normalization
- instruction extraction from explicit user-originated events
- tool/MCP/skill classification
- Claude-compatible code change behavior where supported, otherwise zero

- [ ] **Step 2: Run the OpenCode/OpenClaw tests and verify failure**

Run: `cargo test opencode_openclaw_shared_pipeline --manifest-path src-tauri/Cargo.toml`

Expected: FAIL because both sources still use source-local aggregation logic.

- [ ] **Step 3: Refactor OpenCode into normalized record output**

Extract database-backed rows into normalized records, preserve reliable timestamps, and stop relying on source-local cutoffs for final statistics.

- [ ] **Step 4: Refactor OpenClaw into normalized record output**

Keep explicit record timestamps as the final inclusion rule and classify tool/skill/MCP conservatively.

- [ ] **Step 5: Re-run the OpenCode/OpenClaw tests**

Run: `cargo test opencode_openclaw_shared_pipeline --manifest-path src-tauri/Cargo.toml`

Expected: PASS

- [ ] **Step 6: Commit the OpenCode/OpenClaw migration**

```bash
git add src-tauri/src/sources/opencode.rs src-tauri/src/sources/openclaw.rs src-tauri/tests/opencode_openclaw_shared_pipeline.rs
git commit -m "feat: migrate opencode and openclaw sources to shared pipeline"
```

### Task 7: Update Frontend Contracts And Multi-Page Filter Parity

**Files:**
- Create: `src/lib/unifiedStatistics.test.ts`
- Modify: `src/types/statistics.ts`
- Modify: `src/hooks/useStatistics.ts`
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/pages/Skills.tsx`
- Modify: `src/pages/McpServers.tsx`
- Modify: `src/pages/Sessions.tsx`
- Modify: `src/pages/Instructions.tsx`
- Modify: `src/pages/Report.tsx`

- [ ] **Step 1: Add failing frontend tests for instruction/source contract changes**

Write tests that prove:

- instruction rows can display `source`
- session rows can be keyed and rendered by `source + session_id`
- page-level queries continue to accept project, provider, and active time range inputs
- empty states still render when the filtered record set is empty

- [ ] **Step 2: Run the frontend tests and verify failure**

Run: `pnpm exec vitest run src/lib/unifiedStatistics.test.ts`

Expected: FAIL because frontend types and page rendering do not yet support the updated instruction shape.

- [ ] **Step 3: Extend frontend statistics contracts only where needed**

Update:

- `InstructionInfo` to include `source`
- `SessionInfo` or an equivalent stable identity field so the UI can key rows by `source + session_id`

Keep the rest of the frontend contracts aligned with the backend shared pipeline output.

- [ ] **Step 4: Update the affected pages**

Make sure:

- `Dashboard` reads shared aggregate results unchanged
- `Skills`, `McpServers`, and `Sessions` remain filter-driven
- `Instructions` shows source as informational metadata and still respects the same filters
- `Sessions` uses a composite source-aware identity for row keys and exposes source visibly enough to avoid ambiguous collisions
- `Report` stays on the same shared statistics pipeline and remains filter-driven

- [ ] **Step 5: Re-run the frontend tests**

Run: `pnpm exec vitest run src/lib/unifiedStatistics.test.ts`

Expected: PASS

- [ ] **Step 6: Commit the frontend parity changes**

```bash
git add src/types/statistics.ts src/hooks/useStatistics.ts src/pages/Dashboard.tsx src/pages/Skills.tsx src/pages/McpServers.tsx src/pages/Sessions.tsx src/pages/Instructions.tsx src/pages/Report.tsx src/lib/unifiedStatistics.test.ts
git commit -m "feat: align frontend pages with unified statistics pipeline"
```

### Task 8: Verify, Build, And Smoke Test The App

**Files:**
- Modify: `package.json` (only if verification scripts need adjustment)
- Review: `docs/superpowers/specs/2026-03-22-multi-source-unified-statistics-design.md`
- Review: `docs/superpowers/plans/2026-03-22-multi-source-unified-statistics-implementation.md`

- [ ] **Step 1: Run the full Rust verification suite**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`

Expected: PASS

- [ ] **Step 2: Run the frontend verification suite**

Run: `pnpm test`

Expected: PASS

- [ ] **Step 3: Run the frontend production build**

Run: `pnpm build`

Expected: PASS

- [ ] **Step 4: Run the Tauri build**

Run: `cargo build --manifest-path src-tauri/Cargo.toml`

Expected: PASS

- [ ] **Step 5: Launch the app and perform app-level smoke tests**

Use `agent-browser` against the running app to verify:

- top-bar project/provider/time-range changes update dashboard metrics
- enabling or disabling a source in Settings changes the aggregated totals
- absolute date range excludes out-of-range records from the same session/file
- Skills page updates correctly
- Sessions page updates correctly
- Instructions page updates correctly and shows source metadata
- Report page updates correctly

- [ ] **Step 6: Record verification evidence**

Save screenshots or command outputs needed to support the final completion claim.

- [ ] **Step 7: Commit the verification-safe finish**

```bash
git add package.json docs/superpowers/specs/2026-03-22-multi-source-unified-statistics-design.md docs/superpowers/plans/2026-03-22-multi-source-unified-statistics-implementation.md src src-tauri
git commit -m "test: verify unified multi-source statistics end to end"
```
