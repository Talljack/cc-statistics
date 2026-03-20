use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectInfo {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TokenUsage {
    pub input: u64,
    pub output: u64,
    pub cache_read: u64,
    pub cache_creation: u64,
    pub by_model: HashMap<String, ModelTokens>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ModelTokens {
    pub input: u64,
    pub output: u64,
    pub cache_read: u64,
    pub cache_creation: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CodeChanges {
    pub total: ExtensionChanges,
    pub by_extension: HashMap<String, ExtensionChanges>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ExtensionChanges {
    pub additions: u32,
    pub deletions: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Statistics {
    pub sessions: u32,
    pub instructions: u32,
    pub duration_ms: u64,
    pub duration_formatted: String,
    pub tokens: TokenUsage,
    pub code_changes: CodeChanges,
    pub dev_time: DevTime,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DevTime {
    pub total_ms: u64,
    pub ai_time_ms: u64,
    pub user_time_ms: u64,
    pub ai_ratio: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TimeFilter {
    Today,
    Week,
    Month,
    All,
}

impl Default for TimeFilter {
    fn default() -> Self {
        TimeFilter::All
    }
}

// JSONL record types
#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
pub enum JsonlRecord {
    #[serde(rename = "assistant")]
    Assistant(AssistantRecord),
    #[serde(rename = "user")]
    User(UserRecord),
    #[serde(rename = "system")]
    System(SystemRecord),
}

#[derive(Debug, Deserialize)]
pub struct AssistantRecord {
    pub message: AssistantMessage,
}

#[derive(Debug, Deserialize)]
pub struct AssistantMessage {
    pub model: Option<String>,
    pub usage: Option<Usage>,
    pub content: Option<Vec<ContentBlock>>,
}

#[derive(Debug, Deserialize)]
pub struct Usage {
    #[serde(rename = "input_tokens")]
    pub input: Option<u64>,
    #[serde(rename = "output_tokens")]
    pub output: Option<u64>,
    #[serde(rename = "cache_read_input_tokens")]
    pub cache_read: Option<u64>,
    #[serde(rename = "cache_creation_input_tokens")]
    pub cache_creation: Option<u64>,
}

#[derive(Debug, Deserialize)]
pub struct ContentBlock {
    #[serde(rename = "type")]
    pub block_type: Option<String>,
    #[serde(rename = "tool_use")]
    pub tool_use: Option<ToolUse>,
}

#[derive(Debug, Deserialize)]
pub struct ToolUse {
    pub name: Option<String>,
    pub input: Option<ToolInput>,
}

#[derive(Debug, Deserialize)]
pub struct ToolInput {
    #[serde(rename = "file_path")]
    pub file_path: Option<String>,
    pub content: Option<String>,
    #[serde(rename = "old_string")]
    pub old_string: Option<String>,
    #[serde(rename = "new_string")]
    pub new_string: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UserRecord {
    pub timestamp: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SystemRecord {
    pub subtype: Option<String>,
    #[serde(rename = "durationMs")]
    pub duration_ms: Option<u64>,
    pub timestamp: Option<String>,
}
