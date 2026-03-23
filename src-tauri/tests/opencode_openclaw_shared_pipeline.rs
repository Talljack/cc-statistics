use cc_statistics_lib::aggregation::aggregate_statistics;
use cc_statistics_lib::models::QueryTimeRange;
use chrono::DateTime;
use cc_statistics_lib::sources::{openclaw, opencode};
use serde_json::json;
use std::env;
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

extern crate filetime;

static HOME_LOCK: Mutex<()> = Mutex::new(());

struct HomeGuard {
    previous: Option<String>,
}

impl HomeGuard {
    fn set(path: &PathBuf) -> Self {
        let previous = env::var("HOME").ok();
        unsafe {
            env::set_var("HOME", path);
        }
        Self { previous }
    }
}

impl Drop for HomeGuard {
    fn drop(&mut self) {
        unsafe {
            match &self.previous {
                Some(path) => env::set_var("HOME", path),
                None => env::remove_var("HOME"),
            }
        }
    }
}

fn unique_temp_dir(prefix: &str) -> PathBuf {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    env::temp_dir().join(format!("{}-{}-{}", prefix, std::process::id(), unique))
}

fn absolute_same_day() -> QueryTimeRange {
    QueryTimeRange::Absolute {
        start_date: "2026-03-10".to_string(),
        end_date: "2026-03-10".to_string(),
    }
}

fn ts_millis(value: &str) -> i64 {
    DateTime::parse_from_rfc3339(value)
        .unwrap()
        .timestamp_millis()
}

#[test]
fn opencode_instruction_tokens_and_zero_tool_skill_mcp() {
    let _lock = HOME_LOCK.lock().unwrap();
    let home = unique_temp_dir("opencode-home");
    let db_dir = home.join(".local/share/opencode");
    fs::create_dir_all(&db_dir).unwrap();

    let db_path = db_dir.join("opencode.db");
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
        rusqlite::params!["project-1", "openclaw-demo", "/tmp/openclaw-demo"],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO session (id, project_id, time_created, time_updated, summary_additions, summary_deletions, summary_files) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![
            "session-1",
            "project-1",
            ts_millis("2026-03-10T09:00:00+08:00"),
            ts_millis("2026-03-10T09:01:00+08:00"),
            9_i64,
            3_i64,
            2_i64
        ],
    )
    .unwrap();

    conn.execute(
        "INSERT INTO message (session_id, time_created, data) VALUES (?1, ?2, ?3)",
        rusqlite::params![
            "session-1",
            ts_millis("2026-03-10T09:00:10+08:00"),
            json!({
                "role": "user",
                "content": "OpenCode instruction"
            })
            .to_string()
        ],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO message (session_id, time_created, data) VALUES (?1, ?2, ?3)",
        rusqlite::params![
            "session-1",
            ts_millis("2026-03-10T09:00:20+08:00"),
            json!({
                "role": "assistant",
                "modelID": "codex-1",
                "tokens": {
                    "input": 10,
                    "output": 20,
                    "reasoning": 5,
                    "cache": { "read": 2, "write": 3 }
                },
                "cost": 4.5,
                "time": {
                    "created": ts_millis("2026-03-10T09:00:20+08:00"),
                    "completed": ts_millis("2026-03-10T09:00:50+08:00")
                }
            })
            .to_string()
        ],
    )
    .unwrap();

    let _guard = HomeGuard::set(&home);
    let sessions = opencode::collect_normalized_sessions(Some("openclaw-demo"), &absolute_same_day());
    assert_eq!(sessions.len(), 1);

    let stats = aggregate_statistics(&sessions, &absolute_same_day(), &None, &[]);
    assert_eq!(stats.sessions, 1);
    assert_eq!(stats.instructions, 1);
    assert_eq!(stats.tokens.input, 10);
    assert_eq!(stats.tokens.output, 25);
    assert_eq!(stats.tokens.cache_read, 2);
    assert_eq!(stats.tokens.cache_creation, 3);
    assert_eq!(stats.cost_usd, 4.5);
    assert!(stats.tool_usage.is_empty());
    assert!(stats.skill_usage.is_empty());
    assert!(stats.mcp_usage.is_empty());
    assert_eq!(stats.code_changes.total.additions, 9);
    assert_eq!(stats.code_changes.total.deletions, 3);
    assert_eq!(stats.code_changes.total.files, 2);
}

#[test]
fn opencode_partial_range_excludes_summary_code_changes() {
    let _lock = HOME_LOCK.lock().unwrap();
    let home = unique_temp_dir("opencode-partial-home");
    let db_dir = home.join(".local/share/opencode");
    fs::create_dir_all(&db_dir).unwrap();

    let db_path = db_dir.join("opencode.db");
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
        rusqlite::params!["project-1", "slice-demo", "/tmp/slice-demo"],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO session (id, project_id, time_created, time_updated, summary_additions, summary_deletions, summary_files) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![
            "session-1",
            "project-1",
            ts_millis("2026-03-10T11:00:00+08:00"),
            ts_millis("2026-03-11T11:01:00+08:00"),
            12_i64,
            4_i64,
            5_i64
        ],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO message (session_id, time_created, data) VALUES (?1, ?2, ?3)",
        rusqlite::params![
            "session-1",
            ts_millis("2026-03-10T11:00:10+08:00"),
            json!({ "role": "user", "content": "Slice me" }).to_string()
        ],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO message (session_id, time_created, data) VALUES (?1, ?2, ?3)",
        rusqlite::params![
            "session-1",
            ts_millis("2026-03-10T11:00:20+08:00"),
            json!({
                "role": "assistant",
                "modelID": "codex-1",
                "tokens": { "input": 3, "output": 7, "reasoning": 0, "cache": { "read": 1, "write": 0 } },
                "cost": 1.0,
                "time": {
                    "created": ts_millis("2026-03-10T11:00:20+08:00"),
                    "completed": ts_millis("2026-03-10T11:00:30+08:00")
                }
            })
            .to_string()
        ],
    )
    .unwrap();

    let _guard = HomeGuard::set(&home);
    let sessions = opencode::collect_normalized_sessions(Some("slice-demo"), &absolute_same_day());
    let stats = aggregate_statistics(&sessions, &absolute_same_day(), &None, &[]);

    assert_eq!(stats.sessions, 1);
    assert_eq!(stats.instructions, 1);
    assert_eq!(stats.tokens.input, 3);
    assert_eq!(stats.tokens.output, 7);
    assert_eq!(stats.code_changes.total.additions, 0);
    assert_eq!(stats.code_changes.total.deletions, 0);
    assert_eq!(stats.code_changes.total.files, 0);
}

#[test]
fn openclaw_instruction_tokens_tool_and_mcp_without_skill() {
    let _lock = HOME_LOCK.lock().unwrap();
    let home = unique_temp_dir("openclaw-home");
    let sessions_dir = home.join(".openclaw/agents/main/sessions");
    fs::create_dir_all(&sessions_dir).unwrap();

    let session_path = sessions_dir.join("session-1.jsonl");
    let mut file = fs::File::create(&session_path).unwrap();
    writeln!(
        file,
        "{}",
        json!({
            "type": "session",
            "id": "session-1",
            "cwd": "/tmp/openclaw-demo",
            "timestamp": "2026-03-10T09:00:00+08:00"
        })
    )
    .unwrap();
    writeln!(
        file,
        "{}",
        json!({
            "type": "model_change",
            "modelId": "gpt-4.1",
            "timestamp": "2026-03-10T09:00:30+08:00"
        })
    )
    .unwrap();
    writeln!(
        file,
        "{}",
        json!({
            "type": "message",
            "timestamp": "2026-03-10T09:01:00+08:00",
            "message": {
                "role": "user",
                "content": "OpenClaw instruction"
            }
        })
    )
    .unwrap();
    writeln!(
        file,
        "{}",
        json!({
            "type": "message",
            "timestamp": "2026-03-10T09:02:00+08:00",
            "message": {
                "role": "assistant",
                "model": "gpt-4.1",
                "usage": {
                    "input": 8,
                    "output": 12,
                    "cacheRead": 1,
                    "cacheWrite": 2,
                    "cost": { "total": 0.75 }
                },
                "content": [
                    { "type": "toolCall", "name": "bash" },
                    { "type": "toolCall", "name": "mcp__github__search" }
                ]
            }
        })
    )
    .unwrap();

    // Set mtime so file-level time filtering matches the Absolute range
    let mtime = filetime::FileTime::from_unix_time(
        chrono::NaiveDate::from_ymd_opt(2026, 3, 10).unwrap()
            .and_hms_opt(12, 0, 0).unwrap().and_utc().timestamp(), 0,
    );
    filetime::set_file_mtime(&session_path, mtime).unwrap();

    let _guard = HomeGuard::set(&home);
    let sessions = openclaw::collect_normalized_sessions(Some("openclaw-demo"), &absolute_same_day());
    assert_eq!(sessions.len(), 1);

    let stats = aggregate_statistics(&sessions, &absolute_same_day(), &None, &[]);
    assert_eq!(stats.sessions, 1);
    assert_eq!(stats.instructions, 1);
    assert_eq!(stats.tokens.input, 8);
    assert_eq!(stats.tokens.output, 12);
    assert_eq!(stats.tokens.cache_read, 1);
    assert_eq!(stats.tokens.cache_creation, 2);
    assert_eq!(stats.cost_usd, 0.75);
    assert_eq!(stats.tool_usage.get("bash"), Some(&1));
    assert_eq!(stats.tool_usage.get("mcp__github__search"), Some(&1));
    assert_eq!(stats.mcp_usage.get("mcp__github__search"), Some(&1));
    assert!(stats.skill_usage.is_empty());
}
