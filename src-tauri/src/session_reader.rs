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
