# Multi-Source Unified Statistics Design

Date: 2026-03-22
Project: CC Statistics
Status: Approved for planning

## Goal

Make `Claude Code`, `Codex`, `Gemini`, `OpenCode`, and `OpenClaw` participate in one unified statistics pipeline so that all dashboard and detail views use the same filtering semantics and the same metric definitions.

The resulting app must:

- aggregate from enabled sources only
- apply `project`, `provider`, and `time range` filters consistently
- support `sessions`, `instructions`, `duration`, `tokens`, `cost`, `skill`, `tool`, `mcp`, and `code changes`
- fix absolute date ranges so they are filtered at the record level, not the file level

## Non-Goals

- adding a new visible "source" selector to the top filter bar
- guessing unsupported metrics from weak signals
- inventing a new code change algorithm beyond the current Claude Code semantics
- broad UI redesign

## Product Rules

### Filters

All statistics must be derived from the same effective filter:

- enabled sources from Settings
- selected project
- selected provider
- selected time range

The top bar remains responsible for:

- project
- provider
- time range

Enabled sources remain controlled only in Settings. Source is not promoted to a top-level visible selector.

### Time Range Semantics

All time ranges must be applied at the record level:

- `Today`
- `Week`
- `Month`
- relative custom ranges
- absolute custom ranges

File modification time may still be used as a coarse pre-filter for scan performance, but it must never be the final authority for inclusion in statistics.

For absolute ranges, only records whose own timestamps fall inside the inclusive date window may contribute to any metric.

### Session Semantics

- Session identity is `source + session_id`.
- A session counts as `1` if at least one valid record remains after filtering.
- Sessions from different sources are never merged, even if their IDs or project names collide.

### Duration Semantics

- Duration is computed per session from the filtered record set only.
- Per-session duration is `max(timestamp) - min(timestamp)`.
- If the filtered session contains one timestamp only, duration is `0`.
- Sessions whose computed duration is `0` do not contribute to duration totals.
- Such sessions still count toward session totals if they contain valid filtered activity.

### Instruction Semantics

Instruction means one explicit user-originated request.

Preferred detection order:

1. explicit user message event
2. explicit prompt/command event
3. source-specific stable whitelist rule

Each normalized instruction record must preserve:

- timestamp
- source
- session_id
- project
- provider
- preview content

### Token Semantics

All sources must normalize into the same token fields:

- `input`
- `output`
- `cache_read`
- `cache_creation`
- `by_model`
- `cost_usd`

If a source does not provide a field reliably, the field is `0`. Token fields must not be guessed from unrelated data.

### Code Change Semantics

Code change statistics must keep the current Claude Code semantics as the reference:

- prefer structured patch or diff data
- fall back only to reliable replacement-style content already used by Claude parsing
- preserve `additions`, `deletions`, `files`, and `by_extension`

Other sources may contribute code changes only if they can be mapped to the same semantics with reliable evidence. Otherwise code change contribution is `0`.

## Metric Classification Rules

### Tool, Skill, MCP Relationship

`skill` and `mcp` are semantic subsets of `tool`.

The final statistics layer must output:

- `tool_usage`
- `skill_usage`
- `mcp_usage`

while preserving the Claude rule that the same invocation may count as:

- one tool call
- plus one skill call if it is a high-level skill event
- plus one MCP call if it is an MCP invocation

### Skill Detection

Claude remains the baseline:

- `tool_use.name == "Skill"` is a skill event

For other sources, the parser must attempt detection in this order:

1. explicit high-level event equivalent to Claude Skill
2. source-specific whitelist rule
3. otherwise classify as ordinary tool only

Whitelist-based skill classification is allowed only when no explicit equivalent event exists and must require all of:

- a matching event name or call target
- a matching parameter shape consistent with a high-level workflow/skill call
- a matching call-chain position that indicates orchestration rather than direct low-level execution

Ordinary tool calls must never be promoted to skill without satisfying the rule set.

Each source's skill rules must live in one centralized, testable location rather than being scattered across parsing branches.

### MCP Detection

MCP detection follows the same philosophy:

1. explicit MCP event or structure
2. explicit `mcp__`-style or server/tool layered structure
3. otherwise ordinary tool only

## Architecture

### 1. Normalized Record Layer

Introduce a shared normalized record model as the source of truth for all aggregation.

Representative record families:

- `SessionMetaRecord`
- `InstructionRecord`
- `TokenRecord`
- `ToolRecord`
- `SkillRecord`
- `McpRecord`
- `CodeChangeRecord`

Each record must include enough shared context to support filtering and grouping:

- `source`
- `session_id`
- `timestamp`
- `project`
- `provider`

This layer replaces the current pattern where each source produces partially aggregated `SessionStats` with its own filtering semantics.

### 2. Source Adapters

Each source adapter becomes responsible only for:

- discovering files or databases
- extracting raw events
- normalizing them into the shared record model
- explicitly setting unsupported metrics to zero contribution

Adapters no longer own final aggregation behavior.

### 3. Shared Aggregator

A shared aggregator consumes normalized records and produces:

- overall `Statistics`
- session list data
- instruction list data

This aggregator owns:

- filter application
- grouping by session/project/provider/source
- duration calculation
- tool/skill/mcp counters
- token and cost totals
- code change totals

### 4. Shared Time Filter Pipeline

All range types must pass through the same record-level filter logic.

The system may keep a scan-time optimization step based on file mtime, but the final decision must always be made by comparing normalized record timestamps against the requested range.

This change fixes the current absolute-range behavior where a matching file can cause unrelated records from other dates to be counted.

## Frontend Impact

The visible filter model stays mostly the same.

No new top-bar source selector is introduced.

Frontend pages continue consuming backend responses, but the backend responses now come from the shared normalized aggregation pipeline so that all views remain aligned:

- Dashboard cards
- usage charts
- Skills page
- MCP page
- Sessions page
- Instructions page
- Report page

Instruction rows should retain their `source` as an informational field, but source itself is not exposed as a separate interactive filter outside Settings.

## Implementation Boundaries

### Required

- unify filtering semantics across all sources
- fix absolute date ranges using record timestamps
- support all requested metrics from all enabled sources
- preserve Claude semantics as the metric reference point
- classify non-Claude skill events conservatively and testably

### Allowed

- small internal refactors needed to isolate parsing, filtering, and aggregation
- source-specific fixture data for test coverage
- centralized rule tables for skill and MCP classification

### Not Allowed

- silent heuristic inflation of unsupported metrics
- different filtering semantics for different pages
- different metric definitions per source

## Testing Strategy

### Rust Unit Tests

Add focused tests for:

- record-level filter behavior for built-in, relative, and absolute ranges
- absolute-range exclusion of out-of-range records from the same file or session
- per-source skill/tool/mcp classification
- session counting
- zero-duration exclusion from duration totals
- code change aggregation under Claude-compatible semantics
- provider filtering applied after normalization, before aggregation

### Source Fixtures

Create or extend fixtures for:

- Claude Code
- Codex
- Gemini
- OpenCode
- OpenClaw

Each fixture set should be minimal but sufficient to prove:

- instruction extraction
- token extraction
- session grouping
- duration calculation
- tool/skill/mcp classification
- code change contribution

### Frontend Verification

Verify the UI consumes the unified backend results correctly:

- dashboard cards update when filters change
- Skills page updates when filters change
- Sessions page updates when filters change
- Instructions page updates when filters change
- disabling a source in Settings removes that source's contribution
- absolute date range shows only in-range data

### Build and App Verification

Before claiming completion:

- run frontend build
- run Tauri build
- launch the app
- perform app-level smoke verification against the key filtered views

## Risks

### Source Capability Gaps

Some sources may not expose direct equivalents for Claude Skill or Claude-style code changes.

Mitigation:

- use explicit detection first
- fall back to strict whitelist rules only when justified
- otherwise return zero contribution instead of over-claiming support

### Cross-Source Drift

Keeping per-source parsing and aggregation intertwined will continue to cause semantic drift.

Mitigation:

- centralize aggregation
- centralize time filtering
- centralize classification rule ownership

### Performance

Record-level filtering may increase parse cost.

Mitigation:

- keep file mtime as a scan optimization only
- normalize only the records needed for enabled sources
- add tests and profiling only if the refactor reveals real regressions

## Recommended Next Step

Write an implementation plan that breaks the work into:

1. normalized record model
2. shared filter and aggregator
3. Claude migration onto the shared path
4. Codex/Gemini/OpenCode/OpenClaw adapter upgrades
5. tests
6. build and app-level verification
