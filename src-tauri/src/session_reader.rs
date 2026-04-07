use chrono::DateTime;
use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::Path;
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SessionMessage {
    pub role: String,
    pub content: String,
    pub timestamp: String,
    pub tool_name: Option<String>,
}

pub fn parse_session_messages(jsonl: &str) -> Vec<SessionMessage> {
    let mut messages = Vec::new();

    for line in jsonl.lines() {
        if line.trim().is_empty() {
            continue;
        }

        let value: Value = match serde_json::from_str(line) {
            Ok(value) => value,
            Err(_) => continue,
        };

        let timestamp = value
            .get("timestamp")
            .and_then(Value::as_str)
            .map(str::to_string)
            .or_else(|| {
                value
                    .pointer("/data/message/timestamp")
                    .and_then(Value::as_str)
                    .map(str::to_string)
            })
            .or_else(|| {
                value
                    .pointer("/data/message/message/timestamp")
                    .and_then(Value::as_str)
                    .map(str::to_string)
            });

        let Some(timestamp) = timestamp else {
            continue;
        };

        let message = value
            .get("message")
            .or_else(|| value.pointer("/data/message/message"));

        let Some(message) = message else {
            continue;
        };

        let role = message
            .get("role")
            .and_then(Value::as_str)
            .map(str::to_string);

        let Some(role) = role else {
            continue;
        };

        let Some(content) = message.get("content") else {
            continue;
        };

        messages.extend(extract_content_blocks(&role, &timestamp, content));
    }

    messages
}

pub fn read_session_file(session_id: &str) -> Result<String, String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    let projects_dir = home.join(".claude").join("projects");
    read_session_file_in_dir(&projects_dir, session_id, 4)
}

pub(crate) fn read_openclaw_session_file(session_id: &str) -> Result<String, String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    let sessions_dir = home.join(".openclaw").join("agents").join("main").join("sessions");
    read_session_file_in_dir(&sessions_dir, session_id, 1)
}

fn read_session_file_in_dir(
    base_dir: &Path,
    session_id: &str,
    max_depth: usize,
) -> Result<String, String> {
    if !base_dir.exists() {
        return Err(format!("Directory not found: {}", base_dir.display()));
    }

    let expected_name = format!("{}.jsonl", session_id);

    for entry in WalkDir::new(base_dir)
        .max_depth(max_depth)
        .follow_links(false)
        .into_iter()
        .filter_map(Result::ok)
    {
        if !entry.file_type().is_file() {
            continue;
        }

        if entry.file_name().to_string_lossy() != expected_name {
            continue;
        }

        return fs::read_to_string(entry.path())
            .map_err(|e| format!("Failed to read {}: {}", entry.path().display(), e));
    }

    Err(format!("Session file not found for {}", session_id))
}

fn extract_content_blocks(role: &str, timestamp: &str, content: &Value) -> Vec<SessionMessage> {
    match content {
        Value::String(text) => {
            let text = text.trim();
            if text.is_empty() {
                Vec::new()
            } else {
                vec![SessionMessage {
                    role: role.to_string(),
                    content: text.to_string(),
                    timestamp: timestamp.to_string(),
                    tool_name: None,
                }]
            }
        }
        Value::Array(blocks) => blocks
            .iter()
            .filter_map(|block| content_block_to_message(role, timestamp, block))
            .collect(),
        _ => Vec::new(),
    }
}

fn content_block_to_message(role: &str, timestamp: &str, block: &Value) -> Option<SessionMessage> {
    let block_type = block.get("type").and_then(Value::as_str)?;

    match block_type {
        "text" => block
            .get("text")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|text| !text.is_empty())
            .map(|text| SessionMessage {
                role: role.to_string(),
                content: text.to_string(),
                timestamp: timestamp.to_string(),
                tool_name: None,
            }),
        "tool_use" | "toolCall" => {
            let tool_name = block
                .get("name")
                .and_then(Value::as_str)
                .map(str::to_string)?;
            let payload = block
                .get("input")
                .or_else(|| block.get("arguments"))
                .cloned()
                .unwrap_or(Value::Null);

            let content = stringify_payload(&payload)?;
            Some(SessionMessage {
                role: role.to_string(),
                content,
                timestamp: timestamp.to_string(),
                tool_name: Some(tool_name),
            })
        }
        "tool_result" => {
            let payload = block.get("content")?;
            let content = match payload {
                Value::String(text) => text.trim().to_string(),
                _ => stringify_payload(payload)?,
            };

            if content.is_empty() {
                return None;
            }

            Some(SessionMessage {
                role: role.to_string(),
                content,
                timestamp: timestamp.to_string(),
                tool_name: None,
            })
        }
        _ => None,
    }
}

fn stringify_payload(value: &Value) -> Option<String> {
    match value {
        Value::Null => None,
        Value::String(text) => {
            let text = text.trim();
            if text.is_empty() {
                None
            } else {
                Some(text.to_string())
            }
        }
        Value::Array(_) | Value::Object(_) | Value::Bool(_) | Value::Number(_) => {
            serde_json::to_string(value).ok().filter(|text| !text.is_empty())
        }
    }
}

// ---------------------------------------------------------------------------
// Codex session reader
// ---------------------------------------------------------------------------

pub(crate) fn read_codex_session_file(session_id: &str) -> Result<Vec<SessionMessage>, String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    let sessions_dir = home.join(".codex").join("sessions");

    if !sessions_dir.exists() {
        return Err(format!("Codex sessions directory not found: {}", sessions_dir.display()));
    }

    // Try filename patterns: rollout-{session_id}.jsonl, {session_id}.jsonl
    let candidates = [
        format!("rollout-{}.jsonl", session_id),
        format!("{}.jsonl", session_id),
    ];

    for entry in WalkDir::new(&sessions_dir)
        .max_depth(1)
        .follow_links(false)
        .into_iter()
        .filter_map(Result::ok)
    {
        if !entry.file_type().is_file() {
            continue;
        }

        let file_name = entry.file_name().to_string_lossy().to_string();

        // Direct filename match
        if candidates.iter().any(|c| *c == file_name) {
            return parse_codex_jsonl_file(entry.path());
        }

        // Match by stem: if session_id is a UUID, check if the stem is rollout-{uuid}
        if let Some(stem) = entry.path().file_stem().and_then(|s| s.to_str()) {
            if stem == session_id
                || stem == format!("rollout-{}", session_id)
                || session_id == format!("rollout-{}", stem)
            {
                return parse_codex_jsonl_file(entry.path());
            }
        }
    }

    Err(format!("Codex session file not found for {}", session_id))
}

fn parse_codex_jsonl_file(path: &Path) -> Result<Vec<SessionMessage>, String> {
    let content = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;

    let mut messages = Vec::new();

    for line in content.lines() {
        if line.trim().is_empty() {
            continue;
        }

        let value: Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        // Only process response_item events
        if value.get("type").and_then(Value::as_str) != Some("response_item") {
            continue;
        }

        let payload = match value.get("payload") {
            Some(p) => p,
            None => continue,
        };

        let timestamp = value
            .get("timestamp")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();

        let payload_type = payload
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or("");

        match payload_type {
            "message" => {
                let role = payload
                    .get("role")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string();

                let content = extract_codex_payload_content(payload);

                messages.extend(extract_codex_content_blocks(&role, &timestamp, &content));
            }
            "function_call" | "custom_tool_call" => {
                let tool_name = payload
                    .get("name")
                    .and_then(Value::as_str)
                    .map(str::to_string);

                if let Some(tool_name) = tool_name {
                    let input = payload
                        .get("input")
                        .or_else(|| payload.get("arguments"))
                        .cloned()
                        .unwrap_or(Value::Null);

                    if let Some(content) = stringify_payload(&input) {
                        messages.push(SessionMessage {
                            role: "assistant".to_string(),
                            content,
                            timestamp: timestamp.clone(),
                            tool_name: Some(tool_name),
                        });
                    }
                }
            }
            _ => {}
        }
    }

    Ok(messages)
}

/// Extract content from a Codex payload, trying multiple paths.
fn extract_codex_payload_content(payload: &Value) -> Value {
    payload
        .get("content")
        .cloned()
        .or_else(|| payload.pointer("/message/content").cloned())
        .or_else(|| payload.pointer("/payload/content").cloned())
        .unwrap_or(Value::Null)
}

/// Extract content blocks from Codex messages, handling `input_text` type
/// (used in user messages) in addition to the standard `text` type.
fn extract_codex_content_blocks(role: &str, timestamp: &str, content: &Value) -> Vec<SessionMessage> {
    match content {
        Value::String(text) => {
            let text = text.trim();
            if text.is_empty() {
                Vec::new()
            } else {
                vec![SessionMessage {
                    role: role.to_string(),
                    content: text.to_string(),
                    timestamp: timestamp.to_string(),
                    tool_name: None,
                }]
            }
        }
        Value::Array(blocks) => blocks
            .iter()
            .filter_map(|block| codex_content_block_to_message(role, timestamp, block))
            .collect(),
        _ => Vec::new(),
    }
}

/// Convert a single content block from a Codex message to a SessionMessage.
/// Handles `input_text` (user messages) and `text` (assistant messages).
fn codex_content_block_to_message(
    role: &str,
    timestamp: &str,
    block: &Value,
) -> Option<SessionMessage> {
    let block_type = block.get("type").and_then(Value::as_str)?;

    match block_type {
        "text" | "input_text" => block
            .get("text")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|text| !text.is_empty())
            .map(|text| SessionMessage {
                role: role.to_string(),
                content: text.to_string(),
                timestamp: timestamp.to_string(),
                tool_name: None,
            }),
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// Gemini session reader
// ---------------------------------------------------------------------------

pub(crate) fn read_gemini_session_file(session_id: &str) -> Result<Vec<SessionMessage>, String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    let tmp_dir = home.join(".gemini").join("tmp");

    if !tmp_dir.exists() {
        return Err(format!("Gemini tmp directory not found: {}", tmp_dir.display()));
    }

    // Walk ~/.gemini/tmp/{hash}/chats/ looking for session-{id}.json
    for entry in WalkDir::new(&tmp_dir)
        .max_depth(3)
        .follow_links(false)
        .into_iter()
        .filter_map(Result::ok)
    {
        let path = entry.path();
        if !entry.file_type().is_file() {
            continue;
        }

        let file_name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n,
            None => continue,
        };

        // Check filename match: session-{id}.json or {id}.json
        let stem_matches = path
            .file_stem()
            .and_then(|s| s.to_str())
            .map(|stem| {
                stem == session_id
                    || stem == format!("session-{}", session_id)
                    || session_id == format!("session-{}", stem)
            })
            .unwrap_or(false);

        if !file_name.starts_with("session-") || !file_name.ends_with(".json") {
            if !stem_matches {
                continue;
            }
        }

        // Try to parse and check sessionId field
        let content = match fs::read_to_string(path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let root: Value = match serde_json::from_str(&content) {
            Ok(v) => v,
            Err(_) => continue,
        };

        // Check if sessionId in JSON matches, or if filename stem matches
        let json_session_id = root.get("sessionId").and_then(Value::as_str);
        let matches_json = json_session_id == Some(session_id);
        let matches_stem = path
            .file_stem()
            .and_then(|s| s.to_str())
            .map(|stem| {
                stem == session_id
                    || stem == format!("session-{}", session_id)
                    || session_id == format!("session-{}", stem)
            })
            .unwrap_or(false);

        if !matches_json && !matches_stem {
            continue;
        }

        return parse_gemini_session_json(&root);
    }

    Err(format!("Gemini session file not found for {}", session_id))
}

fn parse_gemini_session_json(root: &Value) -> Result<Vec<SessionMessage>, String> {
    let mut messages = Vec::new();

    let fallback_timestamp = root
        .get("startTime")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    let gemini_messages = match root.get("messages").and_then(Value::as_array) {
        Some(msgs) => msgs,
        None => return Ok(messages),
    };

    for msg in gemini_messages {
        let msg_type = msg.get("type").and_then(Value::as_str).unwrap_or("");

        let role = match msg_type {
            "user" => "user",
            "gemini" => "assistant",
            _ => continue,
        };

        let timestamp = msg
            .get("timestamp")
            .and_then(Value::as_str)
            .or_else(|| msg.get("time").and_then(Value::as_str))
            .unwrap_or(&fallback_timestamp)
            .to_string();

        let content = match msg.get("content") {
            Some(c) => c,
            None => continue,
        };

        match content {
            Value::String(text) => {
                let text = text.trim();
                if !text.is_empty() {
                    messages.push(SessionMessage {
                        role: role.to_string(),
                        content: text.to_string(),
                        timestamp: timestamp.clone(),
                        tool_name: None,
                    });
                }
            }
            Value::Array(items) => {
                for item in items {
                    let text = item
                        .get("text")
                        .and_then(Value::as_str)
                        .map(str::trim)
                        .filter(|t| !t.is_empty());
                    if let Some(text) = text {
                        messages.push(SessionMessage {
                            role: role.to_string(),
                            content: text.to_string(),
                            timestamp: timestamp.clone(),
                            tool_name: None,
                        });
                    }
                }
            }
            _ => {}
        }
    }

    Ok(messages)
}

// ---------------------------------------------------------------------------
// Opencode session reader
// ---------------------------------------------------------------------------

pub(crate) fn read_opencode_session_file(session_id: &str) -> Result<Vec<SessionMessage>, String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    let db_path = home.join(".local").join("share").join("opencode").join("opencode.db");

    if !db_path.exists() {
        return Err(format!("Opencode database not found: {}", db_path.display()));
    }

    let conn = Connection::open_with_flags(
        &db_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|e| format!("Failed to open opencode database: {}", e))?;

    let mut stmt = conn
        .prepare("SELECT data, time_created FROM message WHERE session_id = ?1 ORDER BY time_created ASC")
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let rows = stmt
        .query_map([session_id], |row| {
            let data: String = row.get(0)?;
            let time_created: i64 = row.get::<_, Option<i64>>(1)?.unwrap_or(0);
            Ok((data, time_created))
        })
        .map_err(|e| format!("Failed to query messages: {}", e))?;

    let mut messages = Vec::new();

    for row in rows {
        let (data_str, time_created) = match row {
            Ok(r) => r,
            Err(_) => continue,
        };

        let value: Value = match serde_json::from_str(&data_str) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let role = match value.get("role").and_then(Value::as_str) {
            Some(r) => r.to_string(),
            None => continue,
        };

        // Convert milliseconds since epoch to RFC3339
        let timestamp = if time_created > 0 {
            DateTime::from_timestamp_millis(time_created)
                .map(|dt| dt.to_rfc3339())
                .unwrap_or_default()
        } else {
            String::new()
        };

        let content = match value.get("content") {
            Some(c) => c,
            None => {
                // Try top-level text field
                if let Some(text) = value.get("text").and_then(Value::as_str) {
                    let text = text.trim();
                    if !text.is_empty() {
                        messages.push(SessionMessage {
                            role: role.clone(),
                            content: text.to_string(),
                            timestamp: timestamp.clone(),
                            tool_name: None,
                        });
                    }
                }
                continue;
            }
        };

        match content {
            Value::String(text) => {
                let text = text.trim();
                if !text.is_empty() {
                    messages.push(SessionMessage {
                        role: role.clone(),
                        content: text.to_string(),
                        timestamp: timestamp.clone(),
                        tool_name: None,
                    });
                }
            }
            Value::Array(items) => {
                for item in items {
                    let text = item
                        .get("text")
                        .and_then(Value::as_str)
                        .map(str::trim)
                        .filter(|t| !t.is_empty());
                    if let Some(text) = text {
                        messages.push(SessionMessage {
                            role: role.clone(),
                            content: text.to_string(),
                            timestamp: timestamp.clone(),
                            tool_name: None,
                        });
                    }
                }
            }
            _ => {}
        }
    }

    Ok(messages)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir() -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "cc-statistics-session-reader-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn parses_claude_messages_and_tool_blocks() {
        let jsonl = r#"{"type":"user","timestamp":"2026-03-30T00:00:00Z","message":{"role":"user","content":"hello"}}
{"type":"assistant","timestamp":"2026-03-30T00:00:01Z","message":{"role":"assistant","content":[{"type":"text","text":"answer"},{"type":"tool_use","name":"Read","input":{"path":"README.md"}},{"type":"image","source":{"type":"base64","data":"abc"}}]}}
{"type":"progress","timestamp":"2026-03-30T00:00:02Z","data":{"message":{"message":{"role":"user","content":[{"tool_use_id":"toolu_123","type":"tool_result","content":"tool output"}]}}}}
not json
"#;

        let messages = parse_session_messages(jsonl);

        assert_eq!(
            messages,
            vec![
                SessionMessage {
                    role: "user".to_string(),
                    content: "hello".to_string(),
                    timestamp: "2026-03-30T00:00:00Z".to_string(),
                    tool_name: None,
                },
                SessionMessage {
                    role: "assistant".to_string(),
                    content: "answer".to_string(),
                    timestamp: "2026-03-30T00:00:01Z".to_string(),
                    tool_name: None,
                },
                SessionMessage {
                    role: "assistant".to_string(),
                    content: r#"{"path":"README.md"}"#.to_string(),
                    timestamp: "2026-03-30T00:00:01Z".to_string(),
                    tool_name: Some("Read".to_string()),
                },
                SessionMessage {
                    role: "user".to_string(),
                    content: "tool output".to_string(),
                    timestamp: "2026-03-30T00:00:02Z".to_string(),
                    tool_name: None,
                },
            ]
        );
    }

    #[test]
    fn parses_openclaw_tool_call_blocks() {
        let jsonl = r#"{"type":"message","timestamp":"2026-03-30T00:00:03Z","message":{"role":"assistant","content":[{"type":"toolCall","name":"exec","arguments":{"command":"ls"}},{"type":"thinking","thinking":"skip"},{"type":"text","text":"done"}]}}"#;

        let messages = parse_session_messages(jsonl);

        assert_eq!(
            messages,
            vec![
                SessionMessage {
                    role: "assistant".to_string(),
                    content: r#"{"command":"ls"}"#.to_string(),
                    timestamp: "2026-03-30T00:00:03Z".to_string(),
                    tool_name: Some("exec".to_string()),
                },
                SessionMessage {
                    role: "assistant".to_string(),
                    content: "done".to_string(),
                    timestamp: "2026-03-30T00:00:03Z".to_string(),
                    tool_name: None,
                },
            ]
        );
    }

    #[test]
    fn reads_session_file_from_projects_tree() {
        let root = temp_dir();
        let projects_dir = root.join("projects");
        let project_dir = projects_dir.join("demo-project");
        fs::create_dir_all(&project_dir).unwrap();

        let expected = "{\"type\":\"user\"}\n";
        fs::write(project_dir.join("session-123.jsonl"), expected).unwrap();

        let actual = read_session_file_in_dir(&projects_dir, "session-123", 2).unwrap();
        assert_eq!(actual, expected);

        let _ = fs::remove_dir_all(root);
    }
}
