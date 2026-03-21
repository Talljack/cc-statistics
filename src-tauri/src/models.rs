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
    pub cost_usd: f64,
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
    pub files: u32,
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
    pub tool_usage: HashMap<String, u32>,
    pub skill_usage: HashMap<String, u32>,
    pub mcp_usage: HashMap<String, u32>,
    pub cost_usd: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInfo {
    pub session_id: String,
    pub project_name: String,
    pub timestamp: String,
    pub duration_ms: u64,
    pub duration_formatted: String,
    pub total_tokens: u64,
    pub instructions: u32,
    pub model: String,
    pub git_branch: String,
    pub cost_usd: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstructionInfo {
    pub timestamp: String,
    pub project_name: String,
    pub session_id: String,
    pub content: String,
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
    #[serde(untagged)]
    Days(u32),
}

impl Default for TimeFilter {
    fn default() -> Self {
        TimeFilter::All
    }
}

