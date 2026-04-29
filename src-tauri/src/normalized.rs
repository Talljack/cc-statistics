use crate::models::DiffContent;
use chrono::{DateTime, FixedOffset, Local};

#[derive(Debug, Clone)]
pub struct NormalizedSession {
    pub source: String,
    pub instance_id: String,
    pub instance_label: String,
    pub instance_root_path: String,
    pub session_id: String,
    pub project_name: String,
    pub git_branch: Option<String>,
    pub primary_model: Option<String>,
    pub provider: Option<String>,
    pub records: Vec<NormalizedRecord>,
}

impl NormalizedSession {
    pub fn stable_id(&self) -> String {
        format!("{}:{}:{}", self.source, self.instance_id, self.session_id)
    }
}

#[derive(Debug, Clone)]
pub enum NormalizedRecord {
    Instruction(InstructionRecord),
    Token(TokenRecord),
    Tool(ToolRecord),
    CodeChange(CodeChangeRecord),
}

impl NormalizedRecord {
    pub fn timestamp(&self) -> &DateTime<FixedOffset> {
        match self {
            NormalizedRecord::Instruction(record) => &record.timestamp,
            NormalizedRecord::Token(record) => &record.timestamp,
            NormalizedRecord::Tool(record) => &record.timestamp,
            NormalizedRecord::CodeChange(record) => &record.timestamp,
        }
    }

    pub fn timestamp_local(&self) -> DateTime<Local> {
        self.timestamp().with_timezone(&Local)
    }
}

#[derive(Debug, Clone)]
pub struct InstructionRecord {
    pub timestamp: DateTime<FixedOffset>,
    pub content: String,
}

#[derive(Debug, Clone)]
pub struct TokenRecord {
    pub timestamp: DateTime<FixedOffset>,
    pub model: String,
    pub input: u64,
    pub output: u64,
    pub cache_read: u64,
    pub cache_creation: u64,
    pub cost_usd: f64,
}

#[derive(Debug, Clone)]
pub struct ToolRecord {
    pub timestamp: DateTime<FixedOffset>,
    pub name: String,
    pub skill_name: Option<String>,
    pub mcp_name: Option<String>,
}

#[derive(Debug, Clone)]
pub struct CodeChangeRecord {
    pub timestamp: DateTime<FixedOffset>,
    pub file_path: String,
    pub extension: String,
    pub additions: u32,
    pub deletions: u32,
    pub files: u32,
    pub diff_content: Option<DiffContent>,
}
