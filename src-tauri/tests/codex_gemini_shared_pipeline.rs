use cc_statistics_lib::aggregation::aggregate_statistics;
use cc_statistics_lib::models::QueryTimeRange;
use cc_statistics_lib::sources::{codex, gemini};
use chrono::DateTime;
use serde_json::json;
use std::env;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

extern crate filetime;

fn unique_temp_dir(prefix: &str) -> PathBuf {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    env::temp_dir().join(format!("{}-{}-{}", prefix, std::process::id(), unique))
}

fn absolute_day(day: &str) -> QueryTimeRange {
    QueryTimeRange::Absolute {
        start_date: day.to_string(),
        end_date: day.to_string(),
    }
}

fn ts(value: &str) -> String {
    DateTime::parse_from_rfc3339(value).unwrap().to_rfc3339()
}

fn write_jsonl(path: &Path, lines: &[serde_json::Value]) {
    let mut file = fs::File::create(path).unwrap();
    for line in lines {
        writeln!(file, "{}", line).unwrap();
    }
    // Set mtime to a fixed date so file-level time filtering doesn't skip it
    let mtime = filetime::FileTime::from_unix_time(
        chrono::NaiveDate::from_ymd_opt(2026, 3, 11)
            .unwrap()
            .and_hms_opt(12, 0, 0)
            .unwrap()
            .and_utc()
            .timestamp(),
        0,
    );
    filetime::set_file_mtime(path, mtime).unwrap();
}

fn set_file_mtime(path: &Path, year: i32, month: u32, day: u32) {
    let mtime = filetime::FileTime::from_unix_time(
        chrono::NaiveDate::from_ymd_opt(year, month, day)
            .unwrap()
            .and_hms_opt(12, 0, 0)
            .unwrap()
            .and_utc()
            .timestamp(),
        0,
    );
    filetime::set_file_mtime(path, mtime).unwrap();
}

#[test]
fn codex_shared_pipeline_keeps_skill_tool_mcp_and_token_deltas() {
    let home = unique_temp_dir("codex-shared-home");
    let session_dir = home.join(".codex/sessions/project-a");
    fs::create_dir_all(&session_dir).unwrap();

    write_jsonl(
        &session_dir.join("rollout-123.jsonl"),
        &[
            json!({
                "type": "session_meta",
                "timestamp": ts("2026-03-10T09:00:00+08:00"),
                "payload": {
                    "id": "codex-session-1",
                    "cwd": "/tmp/codex-demo-project",
                    "git": { "branch": "main" }
                }
            }),
            json!({
                "type": "turn_context",
                "payload": { "model": "claude-sonnet-4-5" }
            }),
            json!({
                "type": "response_item",
                "timestamp": ts("2026-03-10T09:00:10+08:00"),
                "payload": {
                    "type": "message",
                    "role": "user",
                    "content": "day10 instruction"
                }
            }),
            json!({
                "type": "event_msg",
                "timestamp": ts("2026-03-10T09:00:20+08:00"),
                "payload": {
                    "type": "token_count",
                    "info": {
                        "total_token_usage": {
                            "input_tokens": 10,
                            "cached_input_tokens": 2,
                            "output_tokens": 20,
                            "reasoning_output_tokens": 5
                        }
                    }
                }
            }),
            json!({
                "type": "response_item",
                "timestamp": ts("2026-03-11T09:00:00+08:00"),
                "payload": {
                    "type": "message",
                    "role": "user",
                    "content": "day11 instruction"
                }
            }),
            json!({
                "type": "response_item",
                "timestamp": ts("2026-03-11T09:00:10+08:00"),
                "payload": {
                    "type": "message",
                    "role": "user",
                    "content": "<skill>\n<name>brainstorming</name>\n<path>/Users/test/brainstorming/SKILL.md</path>\n</skill>"
                }
            }),
            json!({
                "type": "response_item",
                "timestamp": ts("2026-03-11T09:00:20+08:00"),
                "payload": {
                    "type": "function_call",
                    "name": "shell",
                    "input": { "command": "echo hi" }
                }
            }),
            json!({
                "type": "response_item",
                "timestamp": ts("2026-03-11T09:00:30+08:00"),
                "payload": {
                    "type": "function_call",
                    "name": "mcp__filesystem__read_file",
                    "input": { "path": "README.md" }
                }
            }),
            json!({
                "type": "event_msg",
                "timestamp": ts("2026-03-11T09:00:40+08:00"),
                "payload": {
                    "type": "token_count",
                    "info": {
                        "total_token_usage": {
                            "input_tokens": 14,
                            "cached_input_tokens": 3,
                            "output_tokens": 24,
                            "reasoning_output_tokens": 6
                        }
                    }
                }
            }),
            json!({
                "type": "response_item",
                "timestamp": ts("2026-03-11T09:00:50+08:00"),
                "payload": {
                    "type": "custom_tool_call",
                    "name": "apply_patch",
                    "input": "*** Begin Patch\n*** Add File: src/lib.rs\n+hello\n+world\n*** End Patch\n"
                }
            }),
        ],
    );

    let project_filter = vec!["codex-demo-project".to_string()];
    let sessions = codex::collect_normalized_sessions_from_home(
        &home,
        Some(project_filter.as_slice()),
        &absolute_day("2026-03-11"),
    );
    assert_eq!(sessions.len(), 1);

    let stats = aggregate_statistics(&sessions, &absolute_day("2026-03-11"), &None, &[]);
    assert_eq!(stats.sessions, 1);
    assert_eq!(stats.instructions, 1);
    assert_eq!(stats.tokens.input, 3);
    assert_eq!(stats.tokens.output, 5);
    assert_eq!(stats.tokens.cache_read, 1);
    assert_eq!(stats.tokens.cache_creation, 0);
    assert_eq!(stats.tool_usage.get("Skill"), Some(&1));
    assert_eq!(stats.tool_usage.get("shell"), Some(&1));
    assert_eq!(stats.tool_usage.get("mcp__filesystem__read_file"), Some(&1));
    assert_eq!(stats.tool_usage.get("apply_patch"), Some(&1));
    assert_eq!(stats.skill_usage.get("brainstorming"), Some(&1));
    assert_eq!(stats.mcp_usage.get("mcp__filesystem__read_file"), Some(&1));
    assert_eq!(stats.code_changes.total.additions, 2);
    assert_eq!(stats.code_changes.total.deletions, 0);
    assert_eq!(stats.code_changes.total.files, 1);
    assert_eq!(stats.duration_ms, 50000);
}

#[test]
fn codex_shared_pipeline_excludes_assistant_messages_from_instructions() {
    let home = unique_temp_dir("codex-instruction-home");
    let session_dir = home.join(".codex/sessions/project-a");
    fs::create_dir_all(&session_dir).unwrap();

    let session_path = session_dir.join("rollout-instruction.jsonl");
    write_jsonl(
        &session_path,
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
    set_file_mtime(&session_path, 2026, 3, 31);

    let range = absolute_day("2026-03-31");
    let project_filter = vec!["codex-demo-project".to_string()];
    let sessions = codex::collect_normalized_sessions_from_home(
        &home,
        Some(project_filter.as_slice()),
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

    let instructions =
        cc_statistics_lib::aggregation::aggregate_instructions(&sessions, &range, &None, &[]);
    assert_eq!(instructions.len(), 1);
    assert_eq!(instructions[0].content, "only count this prompt");
}

#[test]
fn codex_shared_pipeline_handles_mixed_skill_and_prompt_blocks() {
    let home = unique_temp_dir("codex-mixed-home");
    let session_dir = home.join(".codex/sessions/project-a");
    fs::create_dir_all(&session_dir).unwrap();

    let session_path = session_dir.join("rollout-mixed.jsonl");
    write_jsonl(
        &session_path,
        &[
            json!({
                "type": "session_meta",
                "timestamp": ts("2026-03-31T11:00:00+08:00"),
                "payload": {
                    "id": "codex-mixed-session",
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
                "timestamp": ts("2026-03-31T11:00:05+08:00"),
                "payload": {
                    "type": "message",
                    "role": "user",
                    "content": [
                        { "type": "text", "text": "<skill>\n<name>brainstorming</name>\n<path>/Users/test/brainstorming/SKILL.md</path>\n</skill>" },
                        { "type": "input_text", "text": "prompt after skill block" }
                    ]
                }
            }),
            json!({
                "type": "response_item",
                "timestamp": ts("2026-03-31T11:00:06+08:00"),
                "payload": {
                    "type": "message",
                    "role": "user",
                    "content": [
                        { "type": "input_text", "text": "prompt before skill block" },
                        { "type": "text", "text": "<skill>\n<name>brainstorming</name>\n<path>/Users/test/brainstorming/SKILL.md</path>\n</skill>" }
                    ]
                }
            }),
        ],
    );
    set_file_mtime(&session_path, 2026, 3, 31);

    let range = absolute_day("2026-03-31");
    let project_filter = vec!["codex-demo-project".to_string()];
    let sessions = codex::collect_normalized_sessions_from_home(
        &home,
        Some(project_filter.as_slice()),
        &range,
    );
    assert_eq!(sessions.len(), 1);

    let stats = aggregate_statistics(&sessions, &range, &None, &[]);
    assert_eq!(stats.sessions, 1);
    assert_eq!(stats.instructions, 2);
    assert_eq!(stats.tool_usage.get("Skill"), Some(&2));
    assert_eq!(stats.skill_usage.get("brainstorming"), Some(&2));

    let instructions =
        cc_statistics_lib::aggregation::aggregate_instructions(&sessions, &range, &None, &[]);
    assert_eq!(instructions.len(), 2);
    assert_eq!(instructions[0].content, "prompt before skill block");
    assert_eq!(instructions[1].content, "prompt after skill block");
}

#[test]
fn codex_shared_pipeline_handles_mixed_skill_and_prompt_string_blocks() {
    let home = unique_temp_dir("codex-mixed-string-home");
    let session_dir = home.join(".codex/sessions/project-a");
    fs::create_dir_all(&session_dir).unwrap();

    let session_path = session_dir.join("rollout-mixed-string.jsonl");
    write_jsonl(
        &session_path,
        &[
            json!({
                "type": "session_meta",
                "timestamp": ts("2026-03-31T11:10:00+08:00"),
                "payload": {
                    "id": "codex-mixed-string-session",
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
                "timestamp": ts("2026-03-31T11:10:05+08:00"),
                "payload": {
                    "type": "message",
                    "role": "user",
                    "content": "<skill>\n<name>brainstorming</name>\n<path>/Users/test/brainstorming/SKILL.md</path>\n</skill>\nprompt after skill block"
                }
            }),
            json!({
                "type": "response_item",
                "timestamp": ts("2026-03-31T11:10:06+08:00"),
                "payload": {
                    "type": "message",
                    "role": "user",
                    "content": "prompt before skill block\n<skill>\n<name>brainstorming</name>\n<path>/Users/test/brainstorming/SKILL.md</path>\n</skill>"
                }
            }),
        ],
    );
    set_file_mtime(&session_path, 2026, 3, 31);

    let range = absolute_day("2026-03-31");
    let project_filter = vec!["codex-demo-project".to_string()];
    let sessions = codex::collect_normalized_sessions_from_home(
        &home,
        Some(project_filter.as_slice()),
        &range,
    );
    assert_eq!(sessions.len(), 1);

    let stats = aggregate_statistics(&sessions, &range, &None, &[]);
    assert_eq!(stats.sessions, 1);
    assert_eq!(stats.instructions, 2);
    assert_eq!(stats.tool_usage.get("Skill"), Some(&2));
    assert_eq!(stats.skill_usage.get("brainstorming"), Some(&2));

    let instructions =
        cc_statistics_lib::aggregation::aggregate_instructions(&sessions, &range, &None, &[]);
    assert_eq!(instructions.len(), 2);
    assert!(instructions
        .iter()
        .any(|instruction| instruction.content == "prompt after skill block"));
    assert!(instructions
        .iter()
        .any(|instruction| instruction.content == "prompt before skill block"));
}

#[test]
fn codex_shared_pipeline_strips_injected_setup_text_from_legacy_string_blocks() {
    let home = unique_temp_dir("codex-setup-string-home");
    let session_dir = home.join(".codex/sessions/project-a");
    fs::create_dir_all(&session_dir).unwrap();

    let session_path = session_dir.join("rollout-setup-string.jsonl");
    write_jsonl(
        &session_path,
        &[
            json!({
                "type": "session_meta",
                "timestamp": ts("2026-03-31T11:20:00+08:00"),
                "payload": {
                    "id": "codex-setup-string-session",
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
                "timestamp": ts("2026-03-31T11:20:05+08:00"),
                "payload": {
                    "type": "message",
                    "role": "user",
                    "content": "# AGENTS.md instructions\n- keep this out of the instruction stream\n\nreal prompt after setup"
                }
            }),
            json!({
                "type": "response_item",
                "timestamp": ts("2026-03-31T11:20:06+08:00"),
                "payload": {
                    "type": "message",
                    "role": "user",
                    "content": "real prompt before setup\n\n# AGENTS.md instructions\n- keep this out of the instruction stream"
                }
            }),
        ],
    );
    set_file_mtime(&session_path, 2026, 3, 31);

    let range = absolute_day("2026-03-31");
    let project_filter = vec!["codex-demo-project".to_string()];
    let sessions = codex::collect_normalized_sessions_from_home(
        &home,
        Some(project_filter.as_slice()),
        &range,
    );
    assert_eq!(sessions.len(), 1);

    let stats = aggregate_statistics(&sessions, &range, &None, &[]);
    assert_eq!(stats.sessions, 1);
    assert_eq!(stats.instructions, 2);
    assert_eq!(stats.tool_usage.get("Skill"), None);

    let instructions =
        cc_statistics_lib::aggregation::aggregate_instructions(&sessions, &range, &None, &[]);
    assert_eq!(instructions.len(), 2);
    assert!(instructions
        .iter()
        .any(|instruction| instruction.content == "real prompt after setup"));
    assert!(instructions
        .iter()
        .any(|instruction| instruction.content == "real prompt before setup"));
}

#[test]
fn gemini_shared_pipeline_extracts_instructions_tokens_and_zero_other_signals() {
    let home = unique_temp_dir("gemini-shared-home");
    let hash_dir = home.join(".gemini/tmp/hash-1");
    let chats_dir = hash_dir.join("chats");
    fs::create_dir_all(&chats_dir).unwrap();
    fs::write(hash_dir.join(".project_root"), "/tmp/gemini-demo-project").unwrap();

    let session = json!({
        "sessionId": "gemini-session-1",
        "startTime": "2026-03-10T08:59:00+08:00",
        "messages": [
            {
                "type": "user",
                "timestamp": "2026-03-11T10:00:00+08:00",
                "content": "Gemini instruction one"
            },
            {
                "type": "gemini",
                "timestamp": "2026-03-11T10:01:00+08:00",
                "model": "gemini-2.5-pro",
                "tokens": {
                    "input": 5,
                    "output": 7,
                    "thoughts": 3,
                    "cached": 2
                }
            },
            {
                "type": "user",
                "timestamp": "2026-03-11T10:02:00+08:00",
                "content": "Gemini instruction two"
            },
            {
                "type": "gemini",
                "timestamp": "2026-03-11T10:03:00+08:00",
                "model": "gemini-2.5-pro",
                "tokens": {
                    "input": 4,
                    "output": 6,
                    "thoughts": 1,
                    "cached": 0
                }
            }
        ]
    });
    let gemini_path = chats_dir.join("session-1.json");
    fs::write(&gemini_path, session.to_string()).unwrap();
    let mtime = filetime::FileTime::from_unix_time(
        chrono::NaiveDate::from_ymd_opt(2026, 3, 11)
            .unwrap()
            .and_hms_opt(12, 0, 0)
            .unwrap()
            .and_utc()
            .timestamp(),
        0,
    );
    filetime::set_file_mtime(&gemini_path, mtime).unwrap();

    let project_filter = vec!["gemini-demo-project".to_string()];
    let sessions = gemini::collect_normalized_sessions_from_home(
        &home,
        Some(project_filter.as_slice()),
        &absolute_day("2026-03-11"),
    );
    assert_eq!(sessions.len(), 1);

    let stats = aggregate_statistics(&sessions, &absolute_day("2026-03-11"), &None, &[]);
    assert_eq!(stats.sessions, 1);
    assert_eq!(stats.instructions, 2);
    assert_eq!(stats.tokens.input, 9);
    assert_eq!(stats.tokens.output, 17);
    assert_eq!(stats.tokens.cache_read, 2);
    assert_eq!(stats.tokens.cache_creation, 0);
    assert!(stats.tool_usage.is_empty());
    assert!(stats.skill_usage.is_empty());
    assert!(stats.mcp_usage.is_empty());
    assert_eq!(stats.code_changes.total.additions, 0);
    assert_eq!(stats.code_changes.total.deletions, 0);
    assert_eq!(stats.code_changes.total.files, 0);
}
