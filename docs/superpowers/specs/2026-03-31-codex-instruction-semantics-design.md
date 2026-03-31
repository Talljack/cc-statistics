# Codex Instruction Semantics Correction — Design Spec

## Overview

Fix `instruction` semantics for the `codex` source so the app only counts and displays real user-entered prompts or commands.

Today, Codex assistant commentary and other assistant-authored messages can leak into the normalized instruction stream. That causes the Instructions page, dashboard totals, session instruction counts, and exports to treat AI replies as if they were user requests.

The fix must make one backend definition authoritative across the app:

- instruction means one real user-entered prompt or command
- assistant commentary is not an instruction
- assistant final answers are not instructions
- reasoning records are not instructions
- tool calls and tool outputs are not instructions
- injected setup content is not an instruction

## Problem

The current Codex normalized parser creates `InstructionRecord` entries for nearly any `response_item.payload.type == "message"` text that is not recognized as injected metadata.

That is too broad.

In Codex session logs, assistant commentary and final answers also arrive as `message` payloads. Because the parser does not require `payload.role == "user"`, assistant-authored text is misclassified as a user instruction.

This corrupts every downstream consumer that relies on normalized instruction records:

- Dashboard instruction total
- Report instruction total
- Sessions per-session instruction counts
- Instructions list content
- exports that include instruction counts

## Goals

- make `instruction` mean only real user-entered prompts or commands
- fix Codex instruction extraction at the source of truth, not in page-specific UI logic
- keep all instruction-based statistics consistent across the app
- preserve existing injection filtering for non-user setup messages
- add regression coverage for both normalized parsing and aggregate statistics

## Non-Goals

- redesigning the Instructions page
- introducing a new activity feed for assistant commentary
- refactoring all sources into a new generalized event taxonomy
- changing non-Codex instruction rules unless required by tests or obvious correctness gaps

## Product Rules

### Canonical Instruction Definition

An instruction is one real user-entered prompt or command.

It includes:

- direct user prompt text
- direct user command text

It excludes:

- assistant commentary
- assistant final answers
- assistant summaries
- reasoning records
- tool calls
- tool call outputs
- AGENTS or environment injection
- skill payload injection
- other system or developer setup content

### Scope Of This Fix

This correction applies to every app surface that consumes normalized instruction data. The implementation should not special-case one page.

If the normalized Codex instruction records are correct, the following views should automatically become correct without extra filtering logic:

- Dashboard
- Report
- Sessions
- Instructions
- export output

## Recommended Approach

Tighten the Codex normalized parser so it creates `InstructionRecord` values only from explicit user-role message payloads.

Why:

- the bug originates in record classification, not rendering
- all downstream statistics already depend on normalized instruction records
- a backend fix keeps one semantic definition across the app
- page-level filtering would hide the symptom while leaving counts and exports wrong

## Data Layer Changes

### `src-tauri/src/sources/codex.rs`

Update normalized Codex session parsing so `InstructionRecord` creation requires both:

- `response_item.payload.type == "message"`
- `response_item.payload.role == "user"`

Then extract instruction text only from real user input text blocks.

The parser should:

- accept user-role message payloads only
- read user text from Codex input-style text blocks such as `input_text`
- ignore assistant output-style blocks such as `output_text`
- ignore empty text after trimming
- continue filtering injected setup content such as:
  - `# AGENTS.md instructions`
  - `<environment_context>`
  - `<user_instructions>`
  - `<skill>`

Assistant `message` payloads must never produce `InstructionRecord`.

### Normalized Record Contract

No frontend contract change is required.

`InstructionRecord` remains:

- timestamp
- content

The correction is purely about when a record is emitted, not about changing the shape of the record.

## Aggregation Impact

No aggregation redesign is needed.

Existing shared aggregation should continue to consume normalized instruction records exactly as it does today. Once the Codex source stops emitting assistant-authored instruction records, aggregate results should correct automatically.

This includes:

- total instruction counts
- per-session instruction counts
- instruction list entries
- export instruction totals

## Edge Cases

- If a Codex user message contains only injected setup text, it should not count as an instruction.
- If a Codex user message contains mixed content blocks, only real user text blocks should be considered.
- If a user message becomes empty after trimming and injection filtering, it should not emit an instruction.
- If a session contains only assistant commentary and no user prompts, it should contribute `0` instructions.
- If a session contains both valid user prompts and assistant commentary, only the user prompts should count.

## Testing

### Source Parser Tests

Add or update Codex parser coverage so the normalized parser verifies:

- user-role message produces an `InstructionRecord`
- assistant commentary message does not produce an `InstructionRecord`
- assistant final answer does not produce an `InstructionRecord`
- injected user setup content does not produce an `InstructionRecord`
- mixed sessions preserve valid user prompts while excluding assistant text

### Aggregation Regression Tests

Add regression coverage so aggregate consumers verify:

- instruction totals count only user prompts
- instruction list returns only user prompts
- per-session instruction counts match the normalized user-only rule

## Files Expected To Change

- `src-tauri/src/sources/codex.rs`
- `src-tauri/src/aggregation.rs`
- `src-tauri/src/commands.rs` if test fixtures or command-level assertions need updates
- relevant Rust tests for Codex normalized parsing and instruction aggregation

## Acceptance Criteria

- Codex assistant commentary no longer appears in Instructions list
- Codex assistant final answers no longer appear in Instructions list
- Dashboard and Report instruction totals exclude assistant-authored messages
- Sessions instruction counts exclude assistant-authored messages
- export instruction counts exclude assistant-authored messages
- at least one regression test fails before the fix and passes after it
