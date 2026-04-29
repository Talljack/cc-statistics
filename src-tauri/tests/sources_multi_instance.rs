use cc_statistics_lib::aggregation::aggregate_sessions;
use cc_statistics_lib::models::{
    BuiltInTimeRangeKey, QueryTimeRange, SourceConfig, SourceInstanceConfig, SourceKind,
    SourceQueryConfig,
};
use cc_statistics_lib::session_reader::{
    read_gemini_session_file_from_root, read_hermes_session_file_from_root,
    read_openclaw_session_file_from_root,
    read_opencode_session_file_from_root, read_session_file_from_root,
};
use cc_statistics_lib::sources;
use serde_json::json;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use chrono::DateTime;
use std::time::{SystemTime, UNIX_EPOCH};

extern crate filetime;

fn unique_temp_dir(prefix: &str) -> PathBuf {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    std::env::temp_dir().join(format!("{}-{}-{}", prefix, std::process::id(), unique))
}

fn all_time() -> QueryTimeRange {
    QueryTimeRange::BuiltIn {
        key: BuiltInTimeRangeKey::All,
    }
}

fn ts(value: &str) -> String {
    chrono::DateTime::parse_from_rfc3339(value).unwrap().to_rfc3339()
}

fn write_jsonl(path: &Path, lines: &[serde_json::Value]) {
    let mut file = fs::File::create(path).unwrap();
    for line in lines {
        writeln!(file, "{}", line).unwrap();
    }

    let mtime = filetime::FileTime::from_unix_time(
        chrono::NaiveDate::from_ymd_opt(2026, 4, 29)
            .unwrap()
            .and_hms_opt(12, 0, 0)
            .unwrap()
            .and_utc()
            .timestamp(),
        0,
    );
    filetime::set_file_mtime(path, mtime).unwrap();
}

fn codex_instance(
    root: &Path,
    session_id: &str,
    cwd: &str,
    prompt: &str,
    model: &str,
    input_tokens: u64,
) {
    let session_dir = root.join("sessions").join("project-a");
    fs::create_dir_all(&session_dir).unwrap();
    write_jsonl(
        &session_dir.join(format!("rollout-{}.jsonl", session_id)),
        &[
            json!({
                "type": "session_meta",
                "timestamp": ts("2026-04-29T09:00:00+08:00"),
                "payload": {
                    "id": session_id,
                    "cwd": cwd,
                    "git": { "branch": "main" }
                }
            }),
            json!({
                "type": "turn_context",
                "payload": { "model": model }
            }),
            json!({
                "type": "response_item",
                "timestamp": ts("2026-04-29T09:00:10+08:00"),
                "payload": {
                    "type": "message",
                    "role": "user",
                    "content": prompt
                }
            }),
            json!({
                "type": "event_msg",
                "timestamp": ts("2026-04-29T09:00:20+08:00"),
                "payload": {
                    "type": "token_count",
                    "info": {
                        "total_token_usage": {
                            "input_tokens": input_tokens,
                            "cached_input_tokens": 0,
                            "output_tokens": 5,
                            "reasoning_output_tokens": 0
                        }
                    }
                }
            }),
        ],
    );
}

fn claude_instance(
    root: &Path,
    internal_project_dir: &str,
    session_id: &str,
    cwd: &str,
    prompt: &str,
    model: &str,
    input_tokens: u64,
) {
    let project_dir = root.join("projects").join(internal_project_dir);
    fs::create_dir_all(&project_dir).unwrap();
    write_jsonl(
        &project_dir.join(format!("{}.jsonl", session_id)),
        &[
            json!({
                "type": "user",
                "timestamp": ts("2026-04-29T10:00:00+08:00"),
                "cwd": cwd,
                "message": {
                    "role": "user",
                    "content": prompt
                }
            }),
            json!({
                "type": "assistant",
                "timestamp": ts("2026-04-29T10:00:10+08:00"),
                "gitBranch": "main",
                "message": {
                    "role": "assistant",
                    "model": model,
                    "usage": {
                        "input_tokens": input_tokens,
                        "output_tokens": 7,
                        "cache_read_input_tokens": 0,
                        "cache_creation_input_tokens": 0
                    },
                    "content": [
                        { "type": "text", "text": "done" }
                    ]
                }
            }),
        ],
    );
}

fn gemini_instance(
    root: &Path,
    hash_dir: &str,
    session_id: &str,
    project_root: &str,
    prompt: &str,
    model: &str,
) {
    let base_dir = root.join("tmp").join(hash_dir);
    let chats_dir = base_dir.join("chats");
    fs::create_dir_all(&chats_dir).unwrap();
    fs::write(base_dir.join(".project_root"), project_root).unwrap();
    let path = chats_dir.join(format!("session-{}.json", session_id));
    fs::write(
        &path,
        serde_json::to_string(&json!({
            "sessionId": session_id,
            "startTime": ts("2026-04-29T11:00:00+08:00"),
            "lastUpdated": ts("2026-04-29T11:00:20+08:00"),
            "messages": [
                {
                    "type": "user",
                    "timestamp": ts("2026-04-29T11:00:05+08:00"),
                    "content": prompt
                },
                {
                    "type": "gemini",
                    "timestamp": ts("2026-04-29T11:00:10+08:00"),
                    "model": model,
                    "content": [{ "text": "done" }],
                    "tokens": {
                        "input": 12,
                        "output": 8,
                        "cached": 1,
                        "thoughts": 0
                    }
                }
            ]
        }))
        .unwrap(),
    )
    .unwrap();
    let mtime = filetime::FileTime::from_unix_time(
        chrono::NaiveDate::from_ymd_opt(2026, 4, 29)
            .unwrap()
            .and_hms_opt(12, 0, 0)
            .unwrap()
            .and_utc()
            .timestamp(),
        0,
    );
    filetime::set_file_mtime(&path, mtime).unwrap();
}

fn openclaw_instance(
    root: &Path,
    session_id: &str,
    cwd: &str,
    prompt: &str,
    model: &str,
) {
    let sessions_dir = root.join("agents").join("main").join("sessions");
    fs::create_dir_all(&sessions_dir).unwrap();
    write_jsonl(
        &sessions_dir.join(format!("{}.jsonl", session_id)),
        &[
            json!({
                "type": "session",
                "timestamp": ts("2026-04-29T12:00:00+08:00"),
                "id": session_id,
                "cwd": cwd
            }),
            json!({
                "type": "message",
                "timestamp": ts("2026-04-29T12:00:05+08:00"),
                "message": {
                    "role": "user",
                    "content": prompt
                }
            }),
            json!({
                "type": "message",
                "timestamp": ts("2026-04-29T12:00:10+08:00"),
                "message": {
                    "role": "assistant",
                    "model": model,
                    "usage": {
                        "input": 9,
                        "output": 4,
                        "cacheRead": 0,
                        "cacheWrite": 0
                    },
                    "content": [
                        { "type": "text", "text": "done" }
                    ]
                }
            }),
        ],
    );
}

fn ts_millis(value: &str) -> i64 {
    DateTime::parse_from_rfc3339(value)
        .unwrap()
        .timestamp_millis()
}

fn opencode_instance(
    root: &Path,
    session_id: &str,
    project_name: &str,
    worktree: &str,
    prompt: &str,
    model: &str,
) {
    fs::create_dir_all(root).unwrap();
    let db_path = root.join("opencode.db");
    let conn = rusqlite::Connection::open(&db_path).unwrap();
    conn.execute_batch(
        r#"
        CREATE TABLE project (
            id TEXT PRIMARY KEY,
            name TEXT,
            worktree TEXT
        );
        CREATE TABLE session (
            id TEXT PRIMARY KEY,
            project_id TEXT,
            time_created INTEGER,
            time_updated INTEGER,
            summary_additions INTEGER,
            summary_deletions INTEGER,
            summary_files INTEGER
        );
        CREATE TABLE message (
            session_id TEXT,
            time_created INTEGER,
            data TEXT
        );
        "#,
    )
    .unwrap();

    conn.execute(
        "INSERT INTO project (id, name, worktree) VALUES (?1, ?2, ?3)",
        rusqlite::params!["project-1", project_name, worktree],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO session (id, project_id, time_created, time_updated, summary_additions, summary_deletions, summary_files) VALUES (?1, ?2, ?3, ?4, 0, 0, 0)",
        rusqlite::params![
            session_id,
            "project-1",
            ts_millis("2026-04-29T13:00:00+08:00"),
            ts_millis("2026-04-29T13:00:20+08:00")
        ],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO message (session_id, time_created, data) VALUES (?1, ?2, ?3)",
        rusqlite::params![
            session_id,
            ts_millis("2026-04-29T13:00:05+08:00"),
            json!({ "role": "user", "content": prompt }).to_string()
        ],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO message (session_id, time_created, data) VALUES (?1, ?2, ?3)",
        rusqlite::params![
            session_id,
            ts_millis("2026-04-29T13:00:10+08:00"),
            json!({
                "role": "assistant",
                "modelID": model,
                "tokens": {
                    "input": 6,
                    "output": 3,
                    "reasoning": 0,
                    "cache": { "read": 0, "write": 0 }
                },
                "cost": 1.5,
                "time": {
                    "created": ts_millis("2026-04-29T13:00:10+08:00"),
                    "completed": ts_millis("2026-04-29T13:00:20+08:00")
                }
            }).to_string()
        ],
    )
    .unwrap();
}

fn hermes_instance(
    root: &Path,
    session_id: &str,
    project_name: &str,
    worktree: &str,
    prompt: &str,
    model: &str,
) {
    fs::create_dir_all(root).unwrap();
    let db_path = root.join("state.db");
    let conn = rusqlite::Connection::open(&db_path).unwrap();
    conn.execute_batch(
        r#"
        CREATE TABLE project (
            id TEXT PRIMARY KEY,
            name TEXT,
            worktree TEXT
        );
        CREATE TABLE session (
            id TEXT PRIMARY KEY,
            project_id TEXT,
            time_created INTEGER,
            time_updated INTEGER
        );
        CREATE TABLE message (
            session_id TEXT,
            time_created INTEGER,
            data TEXT
        );
        "#,
    )
    .unwrap();

    conn.execute(
        "INSERT INTO project (id, name, worktree) VALUES (?1, ?2, ?3)",
        rusqlite::params!["project-1", project_name, worktree],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO session (id, project_id, time_created, time_updated) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![
            session_id,
            "project-1",
            ts_millis("2026-04-29T14:00:00+08:00"),
            ts_millis("2026-04-29T14:00:20+08:00")
        ],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO message (session_id, time_created, data) VALUES (?1, ?2, ?3)",
        rusqlite::params![
            session_id,
            ts_millis("2026-04-29T14:00:05+08:00"),
            json!({ "role": "user", "content": prompt }).to_string()
        ],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO message (session_id, time_created, data) VALUES (?1, ?2, ?3)",
        rusqlite::params![
            session_id,
            ts_millis("2026-04-29T14:00:10+08:00"),
            json!({
                "role": "assistant",
                "modelID": model,
                "tokens": {
                    "input": 8,
                    "output": 4,
                    "reasoning": 0,
                    "cache": { "read": 0, "write": 0 }
                },
                "cost": 2.25,
                "time": {
                    "created": ts_millis("2026-04-29T14:00:10+08:00"),
                    "completed": ts_millis("2026-04-29T14:00:20+08:00")
                }
            }).to_string()
        ],
    )
    .unwrap();
}

#[test]
fn query_collectors_merge_multiple_codex_instances_with_distinct_identity() {
    let root_one = unique_temp_dir("codex-instance-one");
    let root_two = unique_temp_dir("codex-instance-two");

    codex_instance(
        &root_one,
        "shared-session",
        "/tmp/project-one",
        "prompt from one",
        "gpt-5.4",
        10,
    );
    codex_instance(
        &root_two,
        "shared-session",
        "/tmp/project-two",
        "prompt from two",
        "claude-sonnet-4-5",
        20,
    );

    let query = SourceQueryConfig {
        enabled_sources: Some(SourceConfig {
            claude_code: false,
            codex: true,
            gemini: false,
            opencode: false,
            openclaw: false,
            hermes: false,
        }),
        source_instances: Some(vec![
            SourceInstanceConfig {
                id: "codex:one".to_string(),
                source: SourceKind::Codex,
                label: "One".to_string(),
                root_path: root_one.to_string_lossy().to_string(),
                enabled: true,
                built_in: false,
            },
            SourceInstanceConfig {
                id: "codex:two".to_string(),
                source: SourceKind::Codex,
                label: "Two".to_string(),
                root_path: root_two.to_string_lossy().to_string(),
                enabled: true,
                built_in: false,
            },
        ]),
    };

    let projects = sources::collect_all_projects_from_query(Some(&query));
    assert_eq!(projects.len(), 2);
    assert!(projects.iter().any(|project| project.name == "project-one"));
    assert!(projects.iter().any(|project| project.name == "project-two"));

    let sessions =
        sources::collect_all_normalized_sessions_from_query(None, &all_time(), Some(&query));
    assert_eq!(sessions.len(), 2);
    assert!(sessions.iter().any(|session| session.instance_id == "codex:one"));
    assert!(sessions.iter().any(|session| session.instance_id == "codex:two"));
    assert!(sessions
        .iter()
        .any(|session| session.instance_root_path == root_one.to_string_lossy()));
    assert!(sessions
        .iter()
        .any(|session| session.instance_root_path == root_two.to_string_lossy()));
    assert_ne!(sessions[0].stable_id(), sessions[1].stable_id());

    let aggregated = aggregate_sessions(&sessions, &all_time(), &None, &[]);
    assert_eq!(aggregated.len(), 2);
    assert!(aggregated.iter().any(|session| session.instance_id == "codex:one"));
    assert!(aggregated.iter().any(|session| session.instance_id == "codex:two"));
    assert!(aggregated
        .iter()
        .any(|session| session.instance_root_path == root_one.to_string_lossy()));
    assert!(aggregated
        .iter()
        .any(|session| session.instance_root_path == root_two.to_string_lossy()));
}

#[test]
fn query_collectors_merge_multiple_claude_instances_and_read_detail_from_matching_root() {
    let root_one = unique_temp_dir("claude-instance-one");
    let root_two = unique_temp_dir("claude-instance-two");

    claude_instance(
        &root_one,
        "-tmp-project-one",
        "shared-session",
        "/tmp/project-one",
        "prompt from claude one",
        "claude-sonnet-4-5",
        11,
    );
    claude_instance(
        &root_two,
        "-tmp-project-two",
        "shared-session",
        "/tmp/project-two",
        "prompt from claude two",
        "claude-opus-4-1",
        22,
    );

    let query = SourceQueryConfig {
        enabled_sources: Some(SourceConfig {
            claude_code: true,
            codex: false,
            gemini: false,
            opencode: false,
            openclaw: false,
            hermes: false,
        }),
        source_instances: Some(vec![
            SourceInstanceConfig {
                id: "claude:one".to_string(),
                source: SourceKind::ClaudeCode,
                label: "One".to_string(),
                root_path: root_one.to_string_lossy().to_string(),
                enabled: true,
                built_in: false,
            },
            SourceInstanceConfig {
                id: "claude:two".to_string(),
                source: SourceKind::ClaudeCode,
                label: "Two".to_string(),
                root_path: root_two.to_string_lossy().to_string(),
                enabled: true,
                built_in: false,
            },
        ]),
    };

    let projects = sources::collect_all_projects_from_query(Some(&query));
    assert_eq!(projects.len(), 2);
    assert!(projects.iter().any(|project| project.name == "project-one"));
    assert!(projects.iter().any(|project| project.name == "project-two"));

    let sessions =
        sources::collect_all_normalized_sessions_from_query(None, &all_time(), Some(&query));
    assert_eq!(sessions.len(), 2);
    assert!(sessions.iter().any(|session| session.instance_id == "claude:one"));
    assert!(sessions.iter().any(|session| session.instance_id == "claude:two"));
    assert!(sessions
        .iter()
        .any(|session| session.instance_root_path == root_one.to_string_lossy()));
    assert!(sessions
        .iter()
        .any(|session| session.instance_root_path == root_two.to_string_lossy()));
    assert_ne!(sessions[0].stable_id(), sessions[1].stable_id());

    let detail_one = read_session_file_from_root(&root_one, "shared-session").unwrap();
    let detail_two = read_session_file_from_root(&root_two, "shared-session").unwrap();
    assert!(detail_one.contains("prompt from claude one"));
    assert!(detail_two.contains("prompt from claude two"));

    let aggregated = aggregate_sessions(&sessions, &all_time(), &None, &[]);
    assert_eq!(aggregated.len(), 2);
    assert!(aggregated.iter().any(|session| session.instance_id == "claude:one"));
    assert!(aggregated.iter().any(|session| session.instance_id == "claude:two"));
}

#[test]
fn query_collectors_merge_multiple_gemini_instances_and_read_detail_from_matching_root() {
    let root_one = unique_temp_dir("gemini-instance-one");
    let root_two = unique_temp_dir("gemini-instance-two");

    gemini_instance(
        &root_one,
        "hash-one",
        "shared-session",
        "/tmp/project-one",
        "prompt from gemini one",
        "gemini-2.5-pro",
    );
    gemini_instance(
        &root_two,
        "hash-two",
        "shared-session",
        "/tmp/project-two",
        "prompt from gemini two",
        "gemini-2.5-flash",
    );

    let query = SourceQueryConfig {
        enabled_sources: Some(SourceConfig {
            claude_code: false,
            codex: false,
            gemini: true,
            opencode: false,
            openclaw: false,
            hermes: false,
        }),
        source_instances: Some(vec![
            SourceInstanceConfig {
                id: "gemini:one".to_string(),
                source: SourceKind::Gemini,
                label: "One".to_string(),
                root_path: root_one.to_string_lossy().to_string(),
                enabled: true,
                built_in: false,
            },
            SourceInstanceConfig {
                id: "gemini:two".to_string(),
                source: SourceKind::Gemini,
                label: "Two".to_string(),
                root_path: root_two.to_string_lossy().to_string(),
                enabled: true,
                built_in: false,
            },
        ]),
    };

    let projects = sources::collect_all_projects_from_query(Some(&query));
    assert_eq!(projects.len(), 2);
    assert!(projects.iter().any(|project| project.name == "project-one"));
    assert!(projects.iter().any(|project| project.name == "project-two"));

    let sessions =
        sources::collect_all_normalized_sessions_from_query(None, &all_time(), Some(&query));
    assert_eq!(sessions.len(), 2);
    assert!(sessions.iter().any(|session| session.instance_id == "gemini:one"));
    assert!(sessions.iter().any(|session| session.instance_id == "gemini:two"));

    let detail_one = read_gemini_session_file_from_root(&root_one, "shared-session").unwrap();
    let detail_two = read_gemini_session_file_from_root(&root_two, "shared-session").unwrap();
    assert!(detail_one.iter().any(|message| message.content.contains("prompt from gemini one")));
    assert!(detail_two.iter().any(|message| message.content.contains("prompt from gemini two")));
}

#[test]
fn query_collectors_merge_multiple_openclaw_instances_and_read_detail_from_matching_root() {
    let root_one = unique_temp_dir("openclaw-instance-one");
    let root_two = unique_temp_dir("openclaw-instance-two");

    openclaw_instance(
        &root_one,
        "shared-session",
        "/tmp/project-one",
        "prompt from openclaw one",
        "claude-sonnet-4-5",
    );
    openclaw_instance(
        &root_two,
        "shared-session",
        "/tmp/project-two",
        "prompt from openclaw two",
        "claude-opus-4-1",
    );

    let query = SourceQueryConfig {
        enabled_sources: Some(SourceConfig {
            claude_code: false,
            codex: false,
            gemini: false,
            opencode: false,
            openclaw: true,
            hermes: false,
        }),
        source_instances: Some(vec![
            SourceInstanceConfig {
                id: "openclaw:one".to_string(),
                source: SourceKind::Openclaw,
                label: "One".to_string(),
                root_path: root_one.to_string_lossy().to_string(),
                enabled: true,
                built_in: false,
            },
            SourceInstanceConfig {
                id: "openclaw:two".to_string(),
                source: SourceKind::Openclaw,
                label: "Two".to_string(),
                root_path: root_two.to_string_lossy().to_string(),
                enabled: true,
                built_in: false,
            },
        ]),
    };

    let projects = sources::collect_all_projects_from_query(Some(&query));
    assert_eq!(projects.len(), 2);
    assert!(projects.iter().any(|project| project.name == "project-one"));
    assert!(projects.iter().any(|project| project.name == "project-two"));

    let sessions =
        sources::collect_all_normalized_sessions_from_query(None, &all_time(), Some(&query));
    assert_eq!(sessions.len(), 2);
    assert!(sessions.iter().any(|session| session.instance_id == "openclaw:one"));
    assert!(sessions.iter().any(|session| session.instance_id == "openclaw:two"));

    let detail_one = read_openclaw_session_file_from_root(&root_one, "shared-session").unwrap();
    let detail_two = read_openclaw_session_file_from_root(&root_two, "shared-session").unwrap();
    assert!(detail_one.contains("prompt from openclaw one"));
    assert!(detail_two.contains("prompt from openclaw two"));
}

#[test]
fn query_collectors_merge_multiple_opencode_instances_and_read_detail_from_matching_root() {
    let root_one = unique_temp_dir("opencode-instance-one");
    let root_two = unique_temp_dir("opencode-instance-two");

    opencode_instance(
        &root_one,
        "shared-session",
        "project-one",
        "/tmp/project-one",
        "prompt from opencode one",
        "codex-1",
    );
    opencode_instance(
        &root_two,
        "shared-session",
        "project-two",
        "/tmp/project-two",
        "prompt from opencode two",
        "gpt-5.4",
    );

    let query = SourceQueryConfig {
        enabled_sources: Some(SourceConfig {
            claude_code: false,
            codex: false,
            gemini: false,
            opencode: true,
            openclaw: false,
            hermes: false,
        }),
        source_instances: Some(vec![
            SourceInstanceConfig {
                id: "opencode:one".to_string(),
                source: SourceKind::Opencode,
                label: "One".to_string(),
                root_path: root_one.to_string_lossy().to_string(),
                enabled: true,
                built_in: false,
            },
            SourceInstanceConfig {
                id: "opencode:two".to_string(),
                source: SourceKind::Opencode,
                label: "Two".to_string(),
                root_path: root_two.to_string_lossy().to_string(),
                enabled: true,
                built_in: false,
            },
        ]),
    };

    let projects = sources::collect_all_projects_from_query(Some(&query));
    assert_eq!(projects.len(), 2);
    assert!(projects.iter().any(|project| project.name == "project-one"));
    assert!(projects.iter().any(|project| project.name == "project-two"));

    let sessions =
        sources::collect_all_normalized_sessions_from_query(None, &all_time(), Some(&query));
    assert_eq!(sessions.len(), 2);
    assert!(sessions.iter().any(|session| session.instance_id == "opencode:one"));
    assert!(sessions.iter().any(|session| session.instance_id == "opencode:two"));

    let detail_one = read_opencode_session_file_from_root(&root_one, "shared-session").unwrap();
    let detail_two = read_opencode_session_file_from_root(&root_two, "shared-session").unwrap();
    assert!(detail_one.iter().any(|message| message.content.contains("prompt from opencode one")));
    assert!(detail_two.iter().any(|message| message.content.contains("prompt from opencode two")));
}

#[test]
fn query_collectors_merge_multiple_hermes_instances_and_read_detail_from_matching_root() {
    let root_one = unique_temp_dir("hermes-instance-one");
    let root_two = unique_temp_dir("hermes-instance-two");

    hermes_instance(
        &root_one,
        "shared-session",
        "project-one",
        "/tmp/project-one",
        "prompt from hermes one",
        "hermes-3-llama-3.1-8b",
    );
    hermes_instance(
        &root_two,
        "shared-session",
        "project-two",
        "/tmp/project-two",
        "prompt from hermes two",
        "nous-hermes-2-mixtral",
    );

    let query = SourceQueryConfig {
        enabled_sources: Some(SourceConfig {
            claude_code: false,
            codex: false,
            gemini: false,
            opencode: false,
            openclaw: false,
            hermes: true,
        }),
        source_instances: Some(vec![
            SourceInstanceConfig {
                id: "hermes:one".to_string(),
                source: SourceKind::Hermes,
                label: "One".to_string(),
                root_path: root_one.to_string_lossy().to_string(),
                enabled: true,
                built_in: false,
            },
            SourceInstanceConfig {
                id: "hermes:two".to_string(),
                source: SourceKind::Hermes,
                label: "Two".to_string(),
                root_path: root_two.to_string_lossy().to_string(),
                enabled: true,
                built_in: false,
            },
        ]),
    };

    let projects = sources::collect_all_projects_from_query(Some(&query));
    assert_eq!(projects.len(), 2);
    assert!(projects.iter().any(|project| project.name == "project-one"));
    assert!(projects.iter().any(|project| project.name == "project-two"));

    let sessions =
        sources::collect_all_normalized_sessions_from_query(None, &all_time(), Some(&query));
    assert_eq!(sessions.len(), 2);
    assert!(sessions.iter().any(|session| session.instance_id == "hermes:one"));
    assert!(sessions.iter().any(|session| session.instance_id == "hermes:two"));
    assert!(sessions
        .iter()
        .any(|session| session.instance_root_path == root_one.to_string_lossy()));
    assert!(sessions
        .iter()
        .any(|session| session.instance_root_path == root_two.to_string_lossy()));
    assert_ne!(sessions[0].stable_id(), sessions[1].stable_id());

    let detail_one = read_hermes_session_file_from_root(&root_one, "shared-session").unwrap();
    let detail_two = read_hermes_session_file_from_root(&root_two, "shared-session").unwrap();
    assert!(detail_one.iter().any(|message| message.content.contains("prompt from hermes one")));
    assert!(detail_two.iter().any(|message| message.content.contains("prompt from hermes two")));

    let aggregated = aggregate_sessions(&sessions, &all_time(), &None, &[]);
    assert_eq!(aggregated.len(), 2);
    assert!(aggregated.iter().any(|session| session.instance_id == "hermes:one"));
    assert!(aggregated.iter().any(|session| session.instance_id == "hermes:two"));
}
