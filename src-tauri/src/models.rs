use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceConfig {
    pub claude_code: bool,
    pub codex: bool,
    pub gemini: bool,
    pub opencode: bool,
    pub openclaw: bool,
}

impl Default for SourceConfig {
    fn default() -> Self {
        Self {
            claude_code: true,
            codex: true,
            gemini: true,
            opencode: true,
            openclaw: true,
        }
    }
}

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
    pub source: String,
    pub input: u64,
    pub output: u64,
    pub cache_read: u64,
    pub cache_creation: u64,
    pub tokens_by_model: HashMap<String, ModelTokens>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstructionInfo {
    pub timestamp: String,
    pub project_name: String,
    pub session_id: String,
    pub source: String,
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BuiltInTimeRangeKey {
    Today,
    Week,
    Month,
    All,
}

impl From<&BuiltInTimeRangeKey> for TimeFilter {
    fn from(value: &BuiltInTimeRangeKey) -> Self {
        match value {
            BuiltInTimeRangeKey::Today => TimeFilter::Today,
            BuiltInTimeRangeKey::Week => TimeFilter::Week,
            BuiltInTimeRangeKey::Month => TimeFilter::Month,
            BuiltInTimeRangeKey::All => TimeFilter::All,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum QueryTimeRange {
    BuiltIn {
        key: BuiltInTimeRangeKey,
    },
    Relative {
        days: u32,
        #[serde(default = "default_include_today")]
        include_today: bool,
    },
    Absolute {
        start_date: String,
        end_date: String,
    },
}

fn default_include_today() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffLine {
    pub kind: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum DiffContent {
    Patch { lines: Vec<DiffLine> },
    TextPair { old: String, new: String },
    Created { content: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileChange {
    pub file_path: String,
    pub extension: String,
    pub change_type: String,
    pub additions: u32,
    pub deletions: u32,
    pub diff_content: Option<DiffContent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderUsage {
    pub source: String,
    pub plan_type: String,
    /// 5-hour window used percentage (0-100)
    pub session_used_percent: f64,
    /// 5-hour window reset countdown in seconds
    pub session_reset_seconds: i64,
    /// Weekly window used percentage (0-100), None if not available
    pub weekly_used_percent: Option<f64>,
    /// Weekly window reset countdown in seconds
    pub weekly_reset_seconds: i64,
    /// Whether the rate limit has been reached
    pub limit_reached: bool,
    /// Extra info like email, account name, credits balance
    pub email: Option<String>,
    pub account_name: Option<String>,
    pub credits_balance: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountUsageResult {
    pub providers: Vec<ProviderUsage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PricingCatalogResult {
    pub providers: Vec<PricingProviderCatalog>,
    pub models: Vec<ModelPriceEntry>,
    pub fetched_at: String,
    pub expires_at: String,
    pub stale: bool,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PricingProviderCatalog {
    pub billing_provider: String,
    pub upstream_provider: Option<String>,
    pub status: String,
    pub stale: bool,
    pub errors: Vec<String>,
    pub model_count: usize,
    pub source_kind: String,
    pub source_url: Option<String>,
    pub fetched_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelPriceEntry {
    pub billing_provider: String,
    pub upstream_provider: Option<String>,
    pub model_id: String,
    pub normalized_model_id: String,
    pub alias_keys: Vec<String>,
    pub input_per_m: Option<f64>,
    pub output_per_m: Option<f64>,
    pub cache_read_per_m: Option<f64>,
    pub cache_write_per_m: Option<f64>,
    pub source_kind: String,
    pub source_url: Option<String>,
    pub resolved_from: Option<String>,
    pub fetched_at: String,
}
