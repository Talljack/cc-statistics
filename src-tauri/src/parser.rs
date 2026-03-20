use crate::models::*;
use chrono::{DateTime, Duration, Local, TimeZone};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;

pub fn parse_session_file(path: &Path, time_filter: &TimeFilter) -> Result<SessionStats, String> {
    let file = File::open(path).map_err(|e| format!("Failed to open file: {}", e))?;
    let reader = BufReader::new(file);

    let mut stats = SessionStats::default();

    // Extract session_id from filename (UUID.jsonl)
    if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
        stats.session_id = Some(stem.to_string());
    }

    for line in reader.lines() {
        let line = line.map_err(|e| format!("Failed to read line: {}", e))?;
        if line.trim().is_empty() {
            continue;
        }

        let value: Value = match serde_json::from_str(&line) {
            Ok(value) => value,
            Err(_) => continue,
        };

        // Extract metadata from early records
        if stats.cwd.is_none() {
            if let Some(cwd) = value.get("cwd").and_then(|v| v.as_str()) {
                stats.cwd = Some(cwd.to_string());
            }
        }
        if stats.version.is_none() {
            if let Some(version) = value.get("version").and_then(|v| v.as_str()) {
                stats.version = Some(version.to_string());
            }
        }
        if stats.first_timestamp.is_none() {
            if let Some(ts) = value.get("timestamp").and_then(|v| v.as_str()) {
                stats.first_timestamp = Some(ts.to_string());
            }
        }

        if !matches_time_filter(&value, time_filter) {
            continue;
        }

        stats.has_activity = true;

        match value.get("type").and_then(|value| value.as_str()) {
            Some("assistant") => parse_assistant_record(&value, &mut stats),
            Some("user") => parse_user_record(&value, &mut stats),
            Some("system") => parse_system_record(&value, &mut stats),
            _ => {}
        }
    }

    Ok(stats)
}

fn parse_assistant_record(value: &Value, stats: &mut SessionStats) {
    let message = match value.get("message") {
        Some(message) => message,
        None => return,
    };

    let usage = match message.get("usage") {
        Some(usage) => usage,
        None => return,
    };

    let input = usage
        .get("input_tokens")
        .and_then(|value| value.as_u64())
        .unwrap_or(0);
    let output = usage
        .get("output_tokens")
        .and_then(|value| value.as_u64())
        .unwrap_or(0);
    let cache_read = usage
        .get("cache_read_input_tokens")
        .and_then(|value| value.as_u64())
        .unwrap_or(0);
    let cache_creation = usage
        .get("cache_creation_input_tokens")
        .and_then(|value| value.as_u64())
        .unwrap_or(0);

    stats.tokens.input += input;
    stats.tokens.output += output;
    stats.tokens.cache_read += cache_read;
    stats.tokens.cache_creation += cache_creation;

    if let Some(model) = message.get("model").and_then(|value| value.as_str()) {
        let model_tokens = stats.tokens.by_model.entry(model.to_string()).or_default();
        model_tokens.input += input;
        model_tokens.output += output;
        model_tokens.cache_read += cache_read;
        model_tokens.cache_creation += cache_creation;

        // Calculate cost for this API call
        let cost = calculate_cost(model, input, output, cache_read, cache_creation);
        model_tokens.cost_usd += cost;
        stats.cost_usd += cost;

        // Track primary model (first model seen)
        if stats.primary_model.is_none() {
            stats.primary_model = Some(model.to_string());
        }
    }

    // Extract tool/skill/MCP usage from content blocks
    if let Some(content) = message.get("content").and_then(|v| v.as_array()) {
        for block in content {
            if block.get("type").and_then(|v| v.as_str()) != Some("tool_use") {
                continue;
            }
            let name = match block.get("name").and_then(|v| v.as_str()) {
                Some(n) => n,
                None => continue,
            };

            // All tool_use → tool_usage
            *stats.tool_usage.entry(name.to_string()).or_insert(0) += 1;

            // Skill calls
            if name == "Skill" {
                if let Some(skill_name) = block
                    .get("input")
                    .and_then(|v| v.get("skill"))
                    .and_then(|v| v.as_str())
                {
                    *stats.skill_usage.entry(skill_name.to_string()).or_insert(0) += 1;
                }
            }

            // MCP calls
            if name.starts_with("mcp__") {
                *stats.mcp_usage.entry(name.to_string()).or_insert(0) += 1;
            }
        }
    }
}

/// Calculate cost in USD based on model pricing
/// Prices are per million tokens
fn calculate_cost(model: &str, input: u64, output: u64, cache_read: u64, cache_creation: u64) -> f64 {
    // (input_per_m, output_per_m, cache_read_per_m, cache_creation_per_m)
    let (input_rate, output_rate, cache_read_rate, cache_creation_rate) = match model {
        // Claude Opus 4 / 4.5 / 4.6
        m if m.contains("opus") => (15.0, 75.0, 1.875, 18.75),
        // Claude Sonnet 4 / 4.5 / 4.6
        m if m.contains("sonnet") => (3.0, 15.0, 0.30, 3.75),
        // Claude Haiku 3.5 / 4.5
        m if m.contains("haiku") => (0.80, 4.0, 0.08, 1.0),
        // Unknown models — use Sonnet pricing as default
        _ => (3.0, 15.0, 0.30, 3.75),
    };

    let m = 1_000_000.0;
    (input as f64 / m) * input_rate
        + (output as f64 / m) * output_rate
        + (cache_read as f64 / m) * cache_read_rate
        + (cache_creation as f64 / m) * cache_creation_rate
}

#[derive(Debug, Default, Clone)]
pub struct SessionStats {
    pub has_activity: bool,
    pub instructions: u32,
    pub duration_ms: u64,
    pub tokens: TokenUsage,
    pub code_changes: CodeChanges,
    /// Tracks unique file paths per extension for file count
    pub changed_files: HashSet<String>,
    /// Tool usage counts
    pub tool_usage: HashMap<String, u32>,
    /// Skill usage counts
    pub skill_usage: HashMap<String, u32>,
    /// MCP tool usage counts
    pub mcp_usage: HashMap<String, u32>,
    /// Estimated cost in USD
    pub cost_usd: f64,
    /// Session metadata
    pub session_id: Option<String>,
    pub first_timestamp: Option<String>,
    pub cwd: Option<String>,
    pub git_branch: Option<String>,
    pub version: Option<String>,
    pub primary_model: Option<String>,
}

#[derive(Debug, Default, Clone)]
pub struct ProjectStats {
    pub sessions: u32,
    pub instructions: u32,
    pub duration_ms: u64,
    pub tokens: TokenUsage,
    pub code_changes: CodeChanges,
    pub tool_usage: HashMap<String, u32>,
    pub skill_usage: HashMap<String, u32>,
    pub mcp_usage: HashMap<String, u32>,
    pub cost_usd: f64,
}

impl ProjectStats {
    /// Merge session stats into project stats
    pub fn merge_session(&mut self, other: SessionStats) {
        self.sessions += 1;
        self.instructions += other.instructions;
        self.duration_ms += other.duration_ms;
        self.cost_usd += other.cost_usd;
        self.tokens.input += other.tokens.input;
        self.tokens.output += other.tokens.output;
        self.tokens.cache_read += other.tokens.cache_read;
        self.tokens.cache_creation += other.tokens.cache_creation;

        // Merge by model tokens
        for (model, other_tokens) in other.tokens.by_model {
            let model_tokens = self.tokens.by_model.entry(model).or_default();
            model_tokens.input += other_tokens.input;
            model_tokens.output += other_tokens.output;
            model_tokens.cache_read += other_tokens.cache_read;
            model_tokens.cache_creation += other_tokens.cache_creation;
            model_tokens.cost_usd += other_tokens.cost_usd;
        }

        // Merge code changes
        self.code_changes.total.additions += other.code_changes.total.additions;
        self.code_changes.total.deletions += other.code_changes.total.deletions;
        self.code_changes.total.files += other.code_changes.total.files;

        for (ext, changes) in other.code_changes.by_extension {
            let ext_changes = self.code_changes.by_extension.entry(ext).or_default();
            ext_changes.additions += changes.additions;
            ext_changes.deletions += changes.deletions;
            ext_changes.files += changes.files;
        }

        // Merge tool/skill/mcp usage
        for (name, count) in other.tool_usage {
            *self.tool_usage.entry(name).or_insert(0) += count;
        }
        for (name, count) in other.skill_usage {
            *self.skill_usage.entry(name).or_insert(0) += count;
        }
        for (name, count) in other.mcp_usage {
            *self.mcp_usage.entry(name).or_insert(0) += count;
        }
    }

    /// Merge another project stats into this one
    pub fn merge(&mut self, other: ProjectStats) {
        self.sessions += other.sessions;
        self.instructions += other.instructions;
        self.duration_ms += other.duration_ms;
        self.cost_usd += other.cost_usd;
        self.tokens.input += other.tokens.input;
        self.tokens.output += other.tokens.output;
        self.tokens.cache_read += other.tokens.cache_read;
        self.tokens.cache_creation += other.tokens.cache_creation;

        // Merge by model tokens
        for (model, other_tokens) in other.tokens.by_model {
            let model_tokens = self.tokens.by_model.entry(model).or_default();
            model_tokens.input += other_tokens.input;
            model_tokens.output += other_tokens.output;
            model_tokens.cache_read += other_tokens.cache_read;
            model_tokens.cache_creation += other_tokens.cache_creation;
            model_tokens.cost_usd += other_tokens.cost_usd;
        }

        // Merge code changes
        self.code_changes.total.additions += other.code_changes.total.additions;
        self.code_changes.total.deletions += other.code_changes.total.deletions;
        self.code_changes.total.files += other.code_changes.total.files;

        for (ext, changes) in other.code_changes.by_extension {
            let ext_changes = self.code_changes.by_extension.entry(ext).or_default();
            ext_changes.additions += changes.additions;
            ext_changes.deletions += changes.deletions;
            ext_changes.files += changes.files;
        }

        // Merge tool/skill/mcp usage
        for (name, count) in other.tool_usage {
            *self.tool_usage.entry(name).or_insert(0) += count;
        }
        for (name, count) in other.skill_usage {
            *self.skill_usage.entry(name).or_insert(0) += count;
        }
        for (name, count) in other.mcp_usage {
            *self.mcp_usage.entry(name).or_insert(0) += count;
        }
    }

    pub fn to_statistics(&self) -> Statistics {
        let _total_tokens = self.tokens.input + self.tokens.output;
        let ai_time_ms = self.duration_ms; // Approximation: all duration is AI time
        let ai_ratio = if self.duration_ms > 0 {
            (ai_time_ms as f64 / self.duration_ms as f64 * 100.0).min(100.0)
        } else {
            0.0
        };

        Statistics {
            sessions: self.sessions,
            instructions: self.instructions,
            duration_ms: self.duration_ms,
            duration_formatted: format_duration(self.duration_ms),
            tokens: self.tokens.clone(),
            code_changes: self.code_changes.clone(),
            dev_time: DevTime {
                total_ms: self.duration_ms,
                ai_time_ms,
                user_time_ms: 0,
                ai_ratio,
            },
            tool_usage: self.tool_usage.clone(),
            skill_usage: self.skill_usage.clone(),
            mcp_usage: self.mcp_usage.clone(),
            cost_usd: self.cost_usd,
        }
    }
}

pub fn format_duration(ms: u64) -> String {
    let seconds = ms / 1000;
    let minutes = seconds / 60;
    let hours = minutes / 60;
    let days = hours / 24;

    if days > 0 {
        let remaining_hours = hours % 24;
        format!("{}d {}h", days, remaining_hours)
    } else if hours > 0 {
        let remaining_minutes = minutes % 60;
        format!("{}h {}m", hours, remaining_minutes)
    } else if minutes > 0 {
        let remaining_seconds = seconds % 60;
        format!("{}m {}s", minutes, remaining_seconds)
    } else {
        format!("{}s", seconds)
    }
}

fn parse_user_record(value: &Value, stats: &mut SessionStats) {
    if let Some(tool_use_result) = value.get("toolUseResult") {
        if let Some((file_path, extension, additions, deletions)) = extract_tool_result_code_changes(tool_use_result)
        {
            stats.code_changes.total.additions += additions;
            stats.code_changes.total.deletions += deletions;

            // Track unique file for this extension
            if stats.changed_files.insert(file_path) {
                stats.code_changes.total.files += 1;
                let ext_changes = stats
                    .code_changes
                    .by_extension
                    .entry(extension.clone())
                    .or_default();
                ext_changes.files += 1;
            }

            let ext_changes = stats
                .code_changes
                .by_extension
                .entry(extension)
                .or_default();
            ext_changes.additions += additions;
            ext_changes.deletions += deletions;
        }
        return;
    }

    if is_user_instruction(value) {
        stats.instructions += 1;
    }
}

fn parse_system_record(value: &Value, stats: &mut SessionStats) {
    // Extract git branch from system init records
    if stats.git_branch.is_none() {
        if let Some(branch) = value
            .pointer("/gitBranch")
            .or_else(|| value.pointer("/git_branch"))
            .and_then(|v| v.as_str())
        {
            stats.git_branch = Some(branch.to_string());
        }
    }

    if value.get("subtype").and_then(|value| value.as_str()) != Some("turn_duration") {
        return;
    }

    if let Some(duration) = value.get("durationMs").and_then(|value| value.as_u64()) {
        stats.duration_ms += duration;
    }
}

fn matches_time_filter(value: &Value, time_filter: &TimeFilter) -> bool {
    if matches!(time_filter, TimeFilter::All) {
        return true;
    }

    let timestamp = match value.get("timestamp").and_then(|value| value.as_str()) {
        Some(timestamp) => timestamp,
        None => return true,
    };

    let record_time = match DateTime::parse_from_rfc3339(timestamp) {
        Ok(record_time) => record_time.with_timezone(&Local),
        Err(_) => return true,
    };

    let now = Local::now();
    match time_filter {
        TimeFilter::Today => {
            let today_start = now.date_naive().and_hms_opt(0, 0, 0).unwrap();
            let today_start_local = Local.from_local_datetime(&today_start).unwrap();
            record_time >= today_start_local
        }
        TimeFilter::Week => record_time >= now - Duration::days(7),
        TimeFilter::Month => record_time >= now - Duration::days(30),
        TimeFilter::All => true,
    }
}

fn is_user_instruction(value: &Value) -> bool {
    let content = match value.pointer("/message/content") {
        Some(content) => content,
        None => return false,
    };

    match content {
        Value::String(text) => !text.trim().is_empty() && !text.starts_with("[Request interrupted"),
        Value::Array(items) => items.iter().any(|item| {
            item.get("type").and_then(|value| value.as_str()) == Some("text")
                && item
                    .get("text")
                    .and_then(|value| value.as_str())
                    .map(|text| !text.trim().is_empty() && !text.starts_with("[Request interrupted"))
                    .unwrap_or(false)
        }),
        _ => false,
    }
}

fn extract_tool_result_code_changes(tool_use_result: &Value) -> Option<(String, String, u32, u32)> {
    let file_path = tool_use_result
        .get("filePath")
        .and_then(|value| value.as_str())
        .or_else(|| {
            tool_use_result
                .get("file")
                .and_then(|value| value.get("filePath"))
                .and_then(|value| value.as_str())
        })?;

    let file_path_owned = file_path.to_string();
    let extension = file_extension(file_path);
    let result_type = tool_use_result
        .get("type")
        .and_then(|value| value.as_str());

    // Explicit "create" => count content lines as additions
    if result_type == Some("create") {
        let additions = tool_use_result
            .get("content")
            .and_then(|value| value.as_str())
            .map(count_lines)
            .unwrap_or(0);
        if additions > 0 {
            return Some((file_path_owned, extension, additions, 0));
        }
    }

    // Check structuredPatch (works for any type including missing/text/update)
    if let Some(patches) =
        tool_use_result.get("structuredPatch").and_then(|value| value.as_array())
    {
        let (additions, deletions) = count_structured_patch_changes(patches);
        if additions > 0 || deletions > 0 {
            return Some((file_path_owned, extension, additions, deletions));
        }
    }

    // Fallback: oldString/newString replacement
    let old_text = tool_use_result
        .get("oldString")
        .and_then(|value| value.as_str())
        .or_else(|| tool_use_result.get("originalFile").and_then(|value| value.as_str()));
    let new_text = tool_use_result
        .get("newString")
        .and_then(|value| value.as_str());

    if old_text.is_some() || new_text.is_some() {
        let (additions, deletions) =
            count_replacement_changes(old_text.unwrap_or(""), new_text.unwrap_or(""));
        if additions > 0 || deletions > 0 {
            return Some((file_path_owned, extension, additions, deletions));
        }
    }

    None
}

fn count_structured_patch_changes(patches: &[Value]) -> (u32, u32) {
    let mut additions = 0;
    let mut deletions = 0;

    for patch in patches {
        let Some(lines) = patch.get("lines").and_then(|value| value.as_array()) else {
            continue;
        };

        for line in lines {
            let Some(line) = line.as_str() else {
                continue;
            };

            if line.starts_with("+++") || line.starts_with("---") {
                continue;
            }
            if line.starts_with('+') {
                additions += 1;
            } else if line.starts_with('-') {
                deletions += 1;
            }
        }
    }

    (additions, deletions)
}

fn count_replacement_changes(old_text: &str, new_text: &str) -> (u32, u32) {
    let old_lines = count_lines(old_text);
    let new_lines = count_lines(new_text);

    if old_text.is_empty() && !new_text.is_empty() {
        return (new_lines, 0);
    }

    let additions = new_lines.saturating_sub(old_lines);
    let deletions = old_lines.saturating_sub(new_lines);
    (additions, deletions)
}

fn count_lines(content: &str) -> u32 {
    content.lines().count() as u32
}

fn file_extension(file_path: &str) -> String {
    Path::new(file_path)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("unknown")
        .to_ascii_lowercase()
}

/// Extract user instructions from a session file
pub fn extract_instructions(path: &Path, time_filter: &TimeFilter) -> Result<Vec<(String, String)>, String> {
    let file = File::open(path).map_err(|e| format!("Failed to open file: {}", e))?;
    let reader = BufReader::new(file);
    let mut results: Vec<(String, String)> = Vec::new(); // (timestamp, content)

    for line in reader.lines() {
        let line = line.map_err(|e| format!("Failed to read line: {}", e))?;
        if line.trim().is_empty() {
            continue;
        }

        let value: Value = match serde_json::from_str(&line) {
            Ok(value) => value,
            Err(_) => continue,
        };

        if value.get("type").and_then(|v| v.as_str()) != Some("user") {
            continue;
        }

        // Skip tool results
        if value.get("toolUseResult").is_some() {
            continue;
        }

        if !matches_time_filter(&value, time_filter) {
            continue;
        }

        if !is_user_instruction(&value) {
            continue;
        }

        let timestamp = value
            .get("timestamp")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let content = extract_user_content(&value);
        if !content.is_empty() {
            // Truncate to 200 chars for preview
            let preview = if content.len() > 200 {
                format!("{}...", &content[..content.char_indices().nth(200).map(|(i, _)| i).unwrap_or(content.len())])
            } else {
                content
            };
            results.push((timestamp, preview));
        }
    }

    Ok(results)
}

fn extract_user_content(value: &Value) -> String {
    let content = match value.pointer("/message/content") {
        Some(content) => content,
        None => return String::new(),
    };

    match content {
        Value::String(text) => text.trim().to_string(),
        Value::Array(items) => {
            items
                .iter()
                .filter_map(|item| {
                    if item.get("type").and_then(|v| v.as_str()) == Some("text") {
                        item.get("text").and_then(|v| v.as_str()).map(|s| s.trim().to_string())
                    } else {
                        None
                    }
                })
                .collect::<Vec<_>>()
                .join("\n")
        }
        _ => String::new(),
    }
}
