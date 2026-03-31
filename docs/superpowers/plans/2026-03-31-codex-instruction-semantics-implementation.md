# Codex Instruction Semantics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Codex `instruction` counts and instruction list entries include only real user-entered prompts or commands, excluding assistant commentary, assistant final answers, reasoning, tool traffic, and injected setup content.

**Architecture:** Keep the fix at the normalized source adapter boundary. `src-tauri/src/sources/codex.rs` should emit `InstructionRecord` only for `response_item.payload.role == "user"` messages, and only from real user input text blocks. Then verify the existing shared aggregation pipeline still produces correct `Statistics`, `SessionInfo`, and `InstructionInfo` without any page-specific filtering.

**Tech Stack:** Rust, Tauri, serde_json, chrono, cargo test

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src-tauri/src/sources/codex.rs` (modify) | Narrow Codex instruction extraction to user-role messages and real input text blocks |
| `src-tauri/tests/codex_gemini_shared_pipeline.rs` (modify) | End-to-end regression coverage for Codex normalized parsing + shared aggregate outputs |
| `docs/superpowers/specs/2026-03-31-codex-instruction-semantics-design.md` (reference) | Approved semantic definition this plan implements |

## Notes Before Coding

- `src-tauri/src/commands.rs` already routes `get_statistics`, `get_sessions`, and `get_instructions` through `sources::collect_all_normalized_sessions(...)` and the shared aggregation layer. Do not add frontend-only filtering.
- The legacy `collect_stats` / `collect_sessions` helpers in source adapters are not on the active command path for these screens. Do not broaden this task into a parallel cleanup unless a targeted regression test proves it is necessary.
- Preserve current Codex skill detection behavior: `<skill>...</skill>` payloads should still classify as `ToolRecord { name: "Skill", ... }`, but they must not create `InstructionRecord`.

---

### Task 1: Add a Failing Codex Shared-Pipeline Regression

**Files:**
- Modify: `src-tauri/tests/codex_gemini_shared_pipeline.rs`

- [ ] **Step 1: Write the failing regression test**

Add a new test to `src-tauri/tests/codex_gemini_shared_pipeline.rs` that creates one Codex session containing:

- a real user prompt
- assistant commentary
- an assistant final answer
- a user `<skill>` payload
- a normal tool call
- one token event

Use this skeleton:

```rust
#[test]
fn codex_shared_pipeline_excludes_assistant_messages_from_instructions() {
    let home = unique_temp_dir("codex-instruction-home");
    let session_dir = home.join(".codex/sessions/project-a");
    fs::create_dir_all(&session_dir).unwrap();

    write_jsonl(
        &session_dir.join("rollout-instruction.jsonl"),
        &[
            json!({
                "type": "session_meta",
                "timestamp": ts("2026-03-31T10:00:00+08:00"),
                "payload": {
                    "id": "codex-instruction-session",
                    "cwd": "/tmp/codex-demo-project",
                    "git": { "branch": "main" }
                }
            }),
            json!({
                "type": "turn_context",
                "payload": { "model": "gpt-5.4" }
            }),
            json!({
                "type": "response_item",
                "timestamp": ts("2026-03-31T10:00:05+08:00"),
                "payload": {
                    "type": "message",
                    "role": "user",
                    "content": [
                        { "type": "input_text", "text": "only count this prompt" }
                    ]
                }
            }),
            json!({
                "type": "response_item",
                "timestamp": ts("2026-03-31T10:00:06+08:00"),
                "payload": {
                    "type": "message",
                    "role": "assistant",
                    "content": [
                        { "type": "output_text", "text": "I am commentary and must not count" }
                    ],
                    "phase": "commentary"
                }
            }),
            json!({
                "type": "response_item",
                "timestamp": ts("2026-03-31T10:00:07+08:00"),
                "payload": {
                    "type": "message",
                    "role": "assistant",
                    "content": [
                        { "type": "output_text", "text": "Final answer text also must not count" }
                    ],
                    "phase": "final_answer"
                }
            }),
            json!({
                "type": "response_item",
                "timestamp": ts("2026-03-31T10:00:08+08:00"),
                "payload": {
                    "type": "message",
                    "role": "user",
                    "content": "<skill>\n<name>brainstorming</name>\n<path>/Users/test/brainstorming/SKILL.md</path>\n</skill>"
                }
            }),
            json!({
                "type": "response_item",
                "timestamp": ts("2026-03-31T10:00:09+08:00"),
                "payload": {
                    "type": "function_call",
                    "name": "shell",
                    "input": { "command": "pwd" }
                }
            }),
            json!({
                "type": "event_msg",
                "timestamp": ts("2026-03-31T10:00:10+08:00"),
                "payload": {
                    "type": "token_count",
                    "info": {
                        "total_token_usage": {
                            "input_tokens": 12,
                            "cached_input_tokens": 2,
                            "output_tokens": 8,
                            "reasoning_output_tokens": 1
                        }
                    }
                }
            }),
        ],
    );

    let range = absolute_day("2026-03-31");
    let sessions = codex::collect_normalized_sessions_from_home(
        &home,
        Some("codex-demo-project"),
        &range,
    );
    assert_eq!(sessions.len(), 1);

    let stats = aggregate_statistics(&sessions, &range, &None, &[]);
    assert_eq!(stats.instructions, 1);
    assert_eq!(stats.tool_usage.get("Skill"), Some(&1));
    assert_eq!(stats.tool_usage.get("shell"), Some(&1));

    let session_rows = cc_statistics_lib::aggregation::aggregate_sessions(&sessions, &range, &None, &[]);
    assert_eq!(session_rows.len(), 1);
    assert_eq!(session_rows[0].instructions, 1);

    let instructions = cc_statistics_lib::aggregation::aggregate_instructions(&sessions, &range, &None, &[]);
    assert_eq!(instructions.len(), 1);
    assert_eq!(instructions[0].content, "only count this prompt");
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd src-tauri && cargo test codex_shared_pipeline_excludes_assistant_messages_from_instructions --test codex_gemini_shared_pipeline`

Expected: FAIL because `instructions.len()` and aggregate instruction counts will be greater than `1` under the current parser.

- [ ] **Step 3: Commit the failing test**

```bash
git add src-tauri/tests/codex_gemini_shared_pipeline.rs
git commit -m "test: add codex instruction regression coverage"
```

---

### Task 2: Restrict Codex Instruction Extraction to Real User Input

**Files:**
- Modify: `src-tauri/src/sources/codex.rs`

- [ ] **Step 1: Add a user-only instruction extraction helper**

In `src-tauri/src/sources/codex.rs`, add a focused helper near `extract_codex_message_text`:

```rust
fn extract_codex_user_instruction(payload: &Value) -> Option<String> {
    let role = payload.get("role").and_then(|value| value.as_str())?;
    if role != "user" {
        return None;
    }

    let content = payload.get("content")?;
    let text = match content {
        Value::String(text) => text.trim().to_string(),
        Value::Array(items) => items
            .iter()
            .filter(|item| {
                matches!(
                    item.get("type").and_then(|value| value.as_str()),
                    Some("input_text") | Some("text")
                )
            })
            .filter_map(|item| item.get("text").and_then(|value| value.as_str()))
            .map(str::trim)
            .filter(|text| !text.is_empty())
            .collect::<Vec<_>>()
            .join("\n"),
        _ => String::new(),
    };

    let text = text.trim();
    if text.is_empty() || is_codex_injected_message(text) {
        return None;
    }

    Some(text.to_string())
}
```

Requirements:

- keep handling legacy string content because existing tests use it
- only read user-role payloads
- ignore assistant `output_text`
- continue filtering injected setup text

- [ ] **Step 2: Update the normalized message branch**

Change the `payload_type == "message"` branch in `parse_normalized_codex_session(...)` to split skill detection from instruction detection:

```rust
match payload_type {
    "message" => {
        let Some(message_text) = extract_codex_message_text(payload) else {
            continue;
        };

        if let Some(skill_name) = extract_codex_skill_name(&message_text) {
            records.push(NormalizedRecord::Tool(ToolRecord {
                timestamp,
                name: "Skill".to_string(),
                skill_name: Some(skill_name),
                mcp_name: None,
            }));
            continue;
        }

        let Some(content) = extract_codex_user_instruction(payload) else {
            continue;
        };

        records.push(NormalizedRecord::Instruction(InstructionRecord {
            timestamp,
            content,
        }));
    }
    // existing function_call/custom_tool_call branch unchanged
```

Key point: assistant messages should now be ignored for `InstructionRecord`, but user `<skill>` messages must still emit the existing `ToolRecord`.

- [ ] **Step 3: Run the regression test to verify it passes**

Run: `cd src-tauri && cargo test codex_shared_pipeline_excludes_assistant_messages_from_instructions --test codex_gemini_shared_pipeline`

Expected: PASS

- [ ] **Step 4: Run the pre-existing Codex shared-pipeline test**

Run: `cd src-tauri && cargo test codex_shared_pipeline_keeps_skill_tool_mcp_and_token_deltas --test codex_gemini_shared_pipeline`

Expected: PASS, proving the instruction fix did not break skill/tool/MCP/token behavior already covered by the shared-pipeline suite.

- [ ] **Step 5: Commit the parser fix**

```bash
git add src-tauri/src/sources/codex.rs src-tauri/tests/codex_gemini_shared_pipeline.rs
git commit -m "fix: count only real codex user prompts as instructions"
```

---

### Task 3: Verify Shared Aggregate Outputs Stay Aligned

**Files:**
- Modify: `src-tauri/tests/codex_gemini_shared_pipeline.rs`

- [ ] **Step 1: Extend the regression test to lock shared aggregate outputs**

If not already asserted in Task 1, ensure the same test checks all three downstream consumers:

- `aggregate_statistics(...).instructions == 1`
- `aggregate_sessions(...)[0].instructions == 1`
- `aggregate_instructions(...).len() == 1`
- `aggregate_instructions(...)[0].content == "only count this prompt"`

Also verify token/tool counters still match the fixture, so the parser change does not accidentally skip the whole session.

- [ ] **Step 2: Run the targeted shared-pipeline suite**

Run: `cd src-tauri && cargo test --test codex_gemini_shared_pipeline`

Expected: PASS

- [ ] **Step 3: Run the aggregation unit test module**

Run: `cd src-tauri && cargo test aggregation::tests`

Expected: PASS

- [ ] **Step 4: Manual app smoke check**

Run the desktop app against local data:

```bash
pnpm tauri dev
```

Verify manually:

- Instructions page no longer shows Codex commentary/final-answer rows as user instructions
- Dashboard instruction card count drops to match real user prompts
- Sessions page per-session instruction counts match the Instructions page count for the same filtered range
- Report export flow still uses instruction totals consistent with Sessions counts

- [ ] **Step 5: Commit the verification pass**

```bash
git add src-tauri/tests/codex_gemini_shared_pipeline.rs
git commit -m "test: verify codex instruction aggregates stay aligned"
```

---

## Done Criteria

- `InstructionRecord` is emitted only for real Codex user input
- assistant commentary and final answers no longer appear in Instructions list
- shared aggregate outputs for statistics, sessions, and instructions agree on the same count
- existing Codex skill/tool/MCP/token behavior remains intact
- targeted cargo tests pass
