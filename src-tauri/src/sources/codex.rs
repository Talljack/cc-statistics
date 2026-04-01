use crate::classification::{classify_tool_call, ToolCallChain};
use crate::commands::{
    model_matches_provider_filters, project_matches_filters, CustomProviderDef,
};
use crate::models::*;
use crate::normalized::{
    CodeChangeRecord, InstructionRecord, NormalizedRecord, NormalizedSession, TokenRecord,
    ToolRecord,
};
use crate::parser::{format_duration, ProjectStats, SessionStats};
use chrono::{DateTime, Duration, Local, TimeZone, Utc};
use rusqlite::{Connection, OpenFlags};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Discover all Codex CLI projects.
/// Returns (project_display_name, project_path) pairs derived from session data.
pub fn discover_projects() -> Vec<(String, String)> {
    let mut seen: HashMap<String, String> = HashMap::new();

    // 1. Scan JSONL session files
    if let Some(sessions_dir) = codex_sessions_dir() {
        for entry in WalkDir::new(&sessions_dir)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let path = entry.path();
            if !is_codex_jsonl(path) {
                continue;
            }
            if let Some((name, cwd)) = extract_project_from_jsonl(path) {
                seen.entry(name).or_insert(cwd);
            }
        }
    }

    // 2. Scan SQLite fallback
    if let Some(db_path) = codex_sqlite_path() {
        if let Ok(rows) = query_sqlite_projects(&db_path) {
            for (name, cwd) in rows {
                seen.entry(name).or_insert(cwd);
            }
        }
    }

    seen.into_iter().collect()
}

/// Collect aggregate statistics across Codex sessions.
pub fn collect_stats(
    project: Option<&[String]>,
    time_filter: &TimeFilter,
    provider_filter: &Option<Vec<String>>,
    custom_providers: &[CustomProviderDef],
) -> ProjectStats {
    let mut combined = ProjectStats::default();

    // JSONL sessions
    if let Some(sessions_dir) = codex_sessions_dir() {
        for entry in WalkDir::new(&sessions_dir)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let path = entry.path();
            if !is_codex_jsonl(path) {
                continue;
            }
            if !filter_by_mtime(time_filter, path) {
                continue;
            }
            let session = match parse_codex_jsonl(path) {
                Some(s) => s,
                None => continue,
            };
            if !session.has_activity {
                continue;
            }
            // Skip empty sessions
            let total_tok = session.tokens.input
                + session.tokens.output
                + session.tokens.cache_read
                + session.tokens.cache_creation;
            if total_tok == 0 && session.instructions == 0 && session.duration_ms == 0 {
                continue;
            }
            if !matches_project(project, &session) {
                continue;
            }
            if !matches_provider(provider_filter, &session, custom_providers) {
                continue;
            }
            combined.merge_session(session);
        }
    }

    // SQLite fallback
    if let Some(db_path) = codex_sqlite_path() {
        if let Ok(rows) = query_sqlite_sessions(&db_path, project, time_filter) {
            for session in rows {
                if !matches_provider(provider_filter, &session, custom_providers) {
                    continue;
                }
                combined.merge_session(session);
            }
        }
    }

    combined
}

/// Collect individual session info entries from Codex data.
pub fn collect_sessions(
    project: Option<&[String]>,
    time_filter: &TimeFilter,
    provider_filter: &Option<Vec<String>>,
    custom_providers: &[CustomProviderDef],
) -> Vec<SessionInfo> {
    let mut sessions: Vec<SessionInfo> = Vec::new();

    // JSONL sessions
    if let Some(sessions_dir) = codex_sessions_dir() {
        for entry in WalkDir::new(&sessions_dir)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let path = entry.path();
            if !is_codex_jsonl(path) {
                continue;
            }
            if !filter_by_mtime(time_filter, path) {
                continue;
            }
            let session = match parse_codex_jsonl(path) {
                Some(s) => s,
                None => continue,
            };
            if !session.has_activity {
                continue;
            }
            // Skip empty sessions
            let total_tok = session.tokens.input
                + session.tokens.output
                + session.tokens.cache_read
                + session.tokens.cache_creation;
            if total_tok == 0 && session.instructions == 0 && session.duration_ms == 0 {
                continue;
            }
            if !matches_project(project, &session) {
                continue;
            }
            if !matches_provider(provider_filter, &session, custom_providers) {
                continue;
            }

            let project_name = session_project_name(&session);
            sessions.push(session_stats_to_info(session, &project_name));
        }
    }

    // SQLite fallback
    if let Some(db_path) = codex_sqlite_path() {
        if let Ok(rows) = query_sqlite_sessions(&db_path, project, time_filter) {
            for session in rows {
                if !matches_provider(provider_filter, &session, custom_providers) {
                    continue;
                }
                let project_name = session_project_name(&session);
                sessions.push(session_stats_to_info(session, &project_name));
            }
        }
    }

    // Sort by timestamp descending
    sessions.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    sessions
}

pub fn collect_normalized_sessions(
    project: Option<&[String]>,
    query_range: &QueryTimeRange,
) -> Vec<NormalizedSession> {
    let Some(home) = dirs::home_dir() else {
        return Vec::new();
    };

    collect_normalized_sessions_from_home(&home, project, query_range)
}

pub fn collect_normalized_sessions_from_home(
    home: &Path,
    project: Option<&[String]>,
    query_range: &QueryTimeRange,
) -> Vec<NormalizedSession> {
    let sessions_dir = home.join(".codex").join("sessions");
    if !sessions_dir.is_dir() {
        return Vec::new();
    }

    let mut sessions = Vec::new();

    for entry in WalkDir::new(&sessions_dir)
        .into_iter()
        .filter_map(|entry| entry.ok())
    {
        let path = entry.path();
        if !is_codex_jsonl(path) {
            continue;
        }

        // Skip files whose modification time falls outside the query range
        if !crate::time_ranges::filter_by_query_range(query_range, &path.to_path_buf()) {
            continue;
        }

        if let Some(session) = parse_normalized_codex_session(path, project, query_range) {
            sessions.push(session);
        }
    }

    sessions.sort_by(|a, b| {
        let a_key = a
            .records
            .first()
            .map(|record| record.timestamp().to_rfc3339())
            .unwrap_or_default();
        let b_key = b
            .records
            .first()
            .map(|record| record.timestamp().to_rfc3339())
            .unwrap_or_default();
        b_key.cmp(&a_key)
    });

    sessions
}

fn parse_normalized_codex_session(
    path: &Path,
    project: Option<&[String]>,
    _query_range: &QueryTimeRange,
) -> Option<NormalizedSession> {
    let file = fs::File::open(path).ok()?;
    let reader = BufReader::new(file);

    let mut session_id = path
        .file_stem()
        .and_then(|s| s.to_str())
        .map(|s| s.to_string());
    let mut cwd: Option<String> = None;
    let mut git_branch: Option<String> = None;
    let mut primary_model: Option<String> = None;
    let mut current_model: Option<String> = None;
    let mut records: Vec<NormalizedRecord> = Vec::new();
    let mut previous_tokens: Option<CodexTokenSnapshot> = None;

    for line in reader.lines() {
        let line = match line {
            Ok(line) => line,
            Err(_) => continue,
        };
        if line.trim().is_empty() {
            continue;
        }

        let value: Value = match serde_json::from_str(&line) {
            Ok(value) => value,
            Err(_) => continue,
        };

        let event_type = value
            .get("type")
            .and_then(|value| value.as_str())
            .unwrap_or("");
        match event_type {
            "session_meta" => {
                if let Some(payload) = value.get("payload") {
                    if let Some(id) = payload.get("id").and_then(|value| value.as_str()) {
                        session_id = Some(id.to_string());
                    }
                    if let Some(value) = payload.get("cwd").and_then(|value| value.as_str()) {
                        cwd = Some(value.to_string());
                    }
                    if let Some(branch) = payload
                        .pointer("/git/branch")
                        .or_else(|| payload.pointer("/gitBranch"))
                        .or_else(|| payload.pointer("/git_branch"))
                        .and_then(|value| value.as_str())
                    {
                        git_branch = Some(branch.to_string());
                    }
                }
            }
            "turn_context" => {
                if let Some(model) = value
                    .pointer("/payload/model")
                    .and_then(|value| value.as_str())
                {
                    let model = model.to_string();
                    current_model = Some(model.clone());
                    if primary_model.is_none() {
                        primary_model = Some(model);
                    }
                }
            }
            "event_msg" => {
                let payload_type = value
                    .pointer("/payload/type")
                    .and_then(|value| value.as_str())
                    .unwrap_or("");
                if payload_type == "token_count" {
                    let Some(timestamp) = extract_codex_timestamp(&value) else {
                        continue;
                    };
                    let Some(current_tokens) = extract_codex_token_snapshot(&value) else {
                        continue;
                    };
                    let delta = current_tokens.delta_since(previous_tokens);
                    previous_tokens = Some(current_tokens);
                    if delta.total() == 0 {
                        continue;
                    }

                    let model = current_model
                        .clone()
                        .or_else(|| primary_model.clone())
                        .unwrap_or_else(|| "unknown".to_string());
                    let output = delta.output + delta.reasoning_output;
                    // OpenAI's input_tokens INCLUDES cached_input_tokens,
                    // so deduct to avoid double-counting
                    let non_cached_input = delta.input.saturating_sub(delta.cached_input);
                    let cost_usd = crate::parser::calculate_cost_for_source("codex",
                        &model,
                        non_cached_input,
                        output,
                        delta.cached_input,
                        0,
                    );
                    let record = NormalizedRecord::Token(TokenRecord {
                        timestamp,
                        model,
                        input: non_cached_input,
                        output,
                        cache_read: delta.cached_input,
                        cache_creation: 0,
                        cost_usd,
                    });
                    records.push(record);
                }
            }
            "response_item" => {
                let payload = match value.get("payload") {
                    Some(payload) => payload,
                    None => continue,
                };
                let payload_type = payload
                    .get("type")
                    .and_then(|value| value.as_str())
                    .unwrap_or("");
                let Some(timestamp) = extract_codex_timestamp(&value) else {
                    continue;
                };

                match payload_type {
                    "message" => {
                        let role = payload.get("role").and_then(|value| value.as_str());
                        if role != Some("user") {
                            continue;
                        }

                        if let Some(skill_name) = extract_codex_skill_name_from_payload(payload) {
                            let record = NormalizedRecord::Tool(ToolRecord {
                                timestamp,
                                name: "Skill".to_string(),
                                skill_name: Some(skill_name),
                                mcp_name: None,
                            });
                            records.push(record);
                        }

                        let Some(content) = extract_codex_user_instruction(payload) else {
                            continue;
                        };
                        let record = NormalizedRecord::Instruction(InstructionRecord {
                            timestamp,
                            content,
                        });
                        records.push(record);
                    }
                    "function_call" | "custom_tool_call" => {
                        let Some(name) = payload.get("name").and_then(|value| value.as_str())
                        else {
                            continue;
                        };
                        let input_value = payload.get("input").or_else(|| payload.get("arguments"));
                        let classification =
                            classify_tool_call("codex", name, input_value, ToolCallChain::Direct);
                        let record = NormalizedRecord::Tool(ToolRecord {
                            timestamp,
                            name: name.to_string(),
                            skill_name: classification.skill_name,
                            mcp_name: classification.mcp_name,
                        });
                        records.push(record);

                        if name == "apply_patch" {
                            if let Some(patch_text) = extract_codex_patch_text(input_value) {
                                if patch_text.trim_start().starts_with("*** Begin Patch") {
                                    for record in parse_codex_patch_records(timestamp, &patch_text)
                                    {
                                        records.push(record);
                                    }
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }
            _ => {}
        }
    }

    if let Some(model) = primary_model.clone() {
        backfill_unknown_token_models(&mut records, &model);
    } else if let Some(model) = current_model.clone() {
        backfill_unknown_token_models(&mut records, &model);
        primary_model = Some(model);
    }

    if records.is_empty() {
        return None;
    }

    let project_name = cwd
        .as_deref()
        .map(project_name_from_cwd)
        .unwrap_or_else(|| "unknown".to_string());
    if !project_matches_filters(project, &project_name) {
        return None;
    }

    let provider = primary_model
        .as_deref()
        .or_else(|| {
            records.iter().find_map(|record| match record {
                NormalizedRecord::Token(token) if token.model != "unknown" => {
                    Some(token.model.as_str())
                }
                _ => None,
            })
        })
        .and_then(|model| model_to_provider(model, &[]));

    Some(NormalizedSession {
        source: "codex".to_string(),
        session_id: session_id.unwrap_or_else(|| "unknown".to_string()),
        project_name,
        git_branch,
        primary_model,
        provider,
        records,
    })
}

#[derive(Debug, Clone, Copy, Default)]
struct CodexTokenSnapshot {
    input: u64,
    cached_input: u64,
    output: u64,
    reasoning_output: u64,
}

impl CodexTokenSnapshot {
    fn total(self) -> u64 {
        // input already includes cached_input, so don't add cached_input again
        self.input + self.output + self.reasoning_output
    }

    fn delta_since(self, previous: Option<Self>) -> Self {
        let previous = previous.unwrap_or_default();
        Self {
            input: self.input.saturating_sub(previous.input),
            cached_input: self.cached_input.saturating_sub(previous.cached_input),
            output: self.output.saturating_sub(previous.output),
            reasoning_output: self
                .reasoning_output
                .saturating_sub(previous.reasoning_output),
        }
    }
}

fn extract_codex_timestamp(value: &Value) -> Option<DateTime<chrono::FixedOffset>> {
    value
        .get("timestamp")
        .and_then(|value| value.as_str())
        .and_then(|timestamp| DateTime::parse_from_rfc3339(timestamp).ok())
}

fn extract_codex_skill_name_from_payload(payload: &Value) -> Option<String> {
    let content = payload
        .get("content")
        .or_else(|| payload.pointer("/message/content"))
        .or_else(|| payload.pointer("/payload/content"))?;
    match content {
        Value::String(text) => extract_codex_skill_name_from_text(text),
        Value::Array(items) => {
            if codex_array_has_embedded_skill(items) {
                return None;
            }

            items
                .iter()
                .filter_map(|item| item.get("text").and_then(|value| value.as_str()))
                .find_map(extract_codex_skill_name_from_text)
        }
        _ => None,
    }
}

fn extract_codex_user_instruction(payload: &Value) -> Option<String> {
    if payload.get("role").and_then(|value| value.as_str()) != Some("user") {
        return None;
    }

    let content = payload
        .get("content")
        .or_else(|| payload.pointer("/message/content"))
        .or_else(|| payload.pointer("/payload/content"))?;

    match content {
        Value::String(text) => extract_codex_instruction_text(text),
        Value::Array(items) => extract_codex_array_instruction_text(items),
        _ => None,
    }
}

fn extract_codex_skill_name(text: &str) -> Option<String> {
    let trimmed = text.trim_start();
    if !trimmed.starts_with("<skill>") {
        return None;
    }

    let name = extract_tag_value(trimmed, "name")?;
    let path = extract_tag_value(trimmed, "path")?;
    if !path.contains("SKILL.md") {
        return None;
    }

    Some(name)
}

fn extract_codex_skill_name_from_text(text: &str) -> Option<String> {
    if codex_skill_block_is_embedded(text) {
        return None;
    }

    let mut collecting_skill_block = false;
    let mut skill_block = String::new();

    for line in text.lines() {
        if collecting_skill_block {
            skill_block.push_str(line);
            skill_block.push('\n');
            if line.contains("</skill>") {
                return extract_codex_skill_name(skill_block.trim_end());
            }
            continue;
        }

        let trimmed = line.trim_start();
        if !trimmed.starts_with("<skill>") {
            continue;
        }

        if let Some(close_index) = trimmed.find("</skill>") {
            if trimmed[close_index + "</skill>".len()..].trim().is_empty() {
                return extract_codex_skill_name(trimmed);
            }
            continue;
        }

        collecting_skill_block = true;
        skill_block.clear();
        skill_block.push_str(line);
        skill_block.push('\n');
    }

    None
}

fn extract_codex_instruction_text(text: &str) -> Option<String> {
    let text = strip_codex_legacy_string_segments(text).trim().to_string();
    if text.is_empty() {
        return None;
    }
    if is_codex_internal_worker_prompt(&text) {
        return None;
    }

    Some(text)
}

fn extract_codex_instruction_block_text(item: &Value) -> Option<String> {
    let block_type = item.get("type").and_then(|value| value.as_str())?;
    if !matches!(block_type, "input_text" | "text") {
        return None;
    }

    let text = item.get("text").and_then(|value| value.as_str())?;
    extract_codex_instruction_text(text)
}

fn extract_codex_array_instruction_text(items: &[Value]) -> Option<String> {
    let text = if codex_array_has_embedded_skill(items) {
        items
            .iter()
            .filter_map(|item| item.get("text").and_then(|value| value.as_str()))
            .collect::<Vec<_>>()
            .join("\n")
    } else {
        items
            .iter()
            .filter_map(extract_codex_instruction_block_text)
            .collect::<Vec<_>>()
            .join("\n")
    };

    let text = text.trim();
    if text.is_empty() {
        None
    } else {
        Some(text.to_string())
    }
}

fn strip_codex_skill_blocks(text: &str) -> String {
    if codex_skill_block_is_embedded(text) {
        return text.to_string();
    }

    let mut stripped = String::new();

    let mut skipping_skill_block = false;
    for line in text.lines() {
        if skipping_skill_block {
            if line.contains("</skill>") {
                skipping_skill_block = false;
            }
            continue;
        }

        let trimmed = line.trim_start();
        if !trimmed.starts_with("<skill>") {
            if !stripped.is_empty() {
                stripped.push('\n');
            }
            stripped.push_str(line);
            continue;
        }

        if let Some(close_index) = trimmed.find("</skill>") {
            if trimmed[close_index + "</skill>".len()..].trim().is_empty() {
                continue;
            }
        } else {
            skipping_skill_block = true;
            continue;
        }

        if !stripped.is_empty() {
            stripped.push('\n');
        }
        stripped.push_str(line);
    }

    stripped
}

fn codex_skill_block_is_embedded(text: &str) -> bool {
    let Some(open_index) = text.find("<skill>") else {
        return false;
    };
    let Some(close_index) = text.rfind("</skill>") else {
        return false;
    };
    if close_index < open_index {
        return false;
    }

    let before = text[..open_index].trim();
    let after = text[close_index + "</skill>".len()..].trim();
    !before.is_empty() && !after.is_empty()
}

fn codex_array_has_embedded_skill(items: &[Value]) -> bool {
    let mut saw_prompt_before_skill = false;

    for (index, item) in items.iter().enumerate() {
        let Some(text) = item.get("text").and_then(|value| value.as_str()) else {
            continue;
        };

        let trimmed = text.trim();
        if trimmed.is_empty() {
            continue;
        }

        if extract_codex_skill_name_from_text(trimmed).is_some() {
            let has_prompt_after_skill = items
                .iter()
                .skip(index + 1)
                .any(codex_array_item_is_prompt_text);
            if saw_prompt_before_skill && has_prompt_after_skill {
                return true;
            }
            continue;
        }

        if codex_array_item_is_prompt_text(item) {
            saw_prompt_before_skill = true;
        }
    }

    false
}

fn codex_array_item_is_prompt_text(item: &Value) -> bool {
    let Some(text) = item.get("text").and_then(|value| value.as_str()) else {
        return false;
    };

    let text = text.trim();
    !text.is_empty() && extract_codex_instruction_text(text).is_some()
}

fn strip_codex_legacy_string_segments(text: &str) -> String {
    strip_codex_injected_setup_segments(&strip_codex_skill_blocks(text))
}

fn strip_codex_injected_setup_segments(text: &str) -> String {
    let mut stripped = String::new();
    let mut skipping_agents = false;
    let mut skipping_xml_block: Option<&str> = None;

    for line in text.lines() {
        if skipping_agents {
            if line.trim().is_empty() {
                skipping_agents = false;
            }
            continue;
        }

        if let Some(tag) = skipping_xml_block {
            if line.contains(&format!("</{}>", tag)) {
                skipping_xml_block = None;
            }
            continue;
        }

        let mut remaining = line;
        let mut line_output = String::new();

        loop {
            let trimmed = remaining.trim_start();
            let leading_len = remaining.len() - trimmed.len();
            let leading = &remaining[..leading_len];

            if trimmed.starts_with("# AGENTS.md instructions") {
                skipping_agents = true;
                break;
            }

            if let Some((tag, close_tag)) = [
                ("environment_context", "</environment_context>"),
                ("user_instructions", "</user_instructions>"),
                ("INSTRUCTIONS", "</INSTRUCTIONS>"),
            ]
            .iter()
            .find(|(tag, _)| trimmed.starts_with(&format!("<{}>", tag)))
        {
                if let Some(close_index) = trimmed.find(close_tag) {
                    let after_close = &trimmed[close_index + close_tag.len()..];
                    remaining = after_close;
                    if remaining.is_empty() {
                        break;
                    }
                    continue;
                }

                skipping_xml_block = Some(tag);
                break;
            }

            line_output.push_str(leading);
            line_output.push_str(trimmed);
            break;
        }

        if !line_output.is_empty() {
            if !stripped.is_empty() {
                stripped.push('\n');
            }
            stripped.push_str(&line_output);
        }
    }

    stripped
}

fn is_codex_internal_worker_prompt(text: &str) -> bool {
    let normalized = text.trim().to_ascii_lowercase();

    if normalized.is_empty() {
        return false;
    }

    if normalized.contains("## superpowers system") {
        return true;
    }

    let markers = [
        "## what was requested",
        "## your job",
        "implementation under review",
        "file:line references",
        "spec compliant",
        "report:",
    ];

    let match_count = markers
        .iter()
        .filter(|marker| normalized.contains(**marker))
        .count();

    match_count >= 2
}

fn extract_tag_value(text: &str, tag: &str) -> Option<String> {
    let open = format!("<{}>", tag);
    let close = format!("</{}>", tag);
    let start = text.find(&open)? + open.len();
    let rest = &text[start..];
    let end = rest.find(&close)?;
    let value = rest[..end].trim();
    (!value.is_empty()).then(|| value.to_string())
}

fn extract_codex_token_snapshot(value: &Value) -> Option<CodexTokenSnapshot> {
    let usage = value.pointer("/payload/info/total_token_usage")?;
    Some(CodexTokenSnapshot {
        input: usage
            .get("input_tokens")
            .and_then(|value| value.as_u64())
            .unwrap_or(0),
        cached_input: usage
            .get("cached_input_tokens")
            .and_then(|value| value.as_u64())
            .unwrap_or(0),
        output: usage
            .get("output_tokens")
            .and_then(|value| value.as_u64())
            .unwrap_or(0),
        reasoning_output: usage
            .get("reasoning_output_tokens")
            .and_then(|value| value.as_u64())
            .unwrap_or(0),
    })
}

fn extract_codex_patch_text(input_value: Option<&Value>) -> Option<String> {
    let input_value = input_value?;
    match input_value {
        Value::String(text) => {
            let text = text.trim();
            (!text.is_empty()).then(|| text.to_string())
        }
        _ => input_value
            .get("input")
            .and_then(|value| value.as_str())
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty()),
    }
}

fn parse_codex_patch_records(
    timestamp: DateTime<chrono::FixedOffset>,
    patch_text: &str,
) -> Vec<NormalizedRecord> {
    let mut per_file: HashMap<String, (u32, u32, Vec<DiffLine>)> = HashMap::new();
    let mut current_file: Option<String> = None;

    for line in patch_text.lines() {
        let line = line.trim_end();
        if let Some(path) = line.strip_prefix("*** Add File: ") {
            current_file = Some(path.trim().to_string());
            continue;
        }
        if let Some(path) = line.strip_prefix("*** Update File: ") {
            current_file = Some(path.trim().to_string());
            continue;
        }
        if let Some(path) = line.strip_prefix("*** Delete File: ") {
            current_file = Some(path.trim().to_string());
            continue;
        }
        if let Some(path) = line.strip_prefix("*** Move to: ") {
            current_file = Some(path.trim().to_string());
            continue;
        }
        if line.starts_with("*** Begin Patch")
            || line.starts_with("*** End of File")
            || line.starts_with("@@")
        {
            continue;
        }

        let Some(file_path) = current_file.clone() else {
            continue;
        };

        let entry = per_file.entry(file_path).or_insert((0, 0, Vec::new()));
        if line.starts_with('+') && !line.starts_with("+++") {
            entry.0 += 1;
            entry.2.push(DiffLine {
                kind: "add".to_string(),
                content: line[1..].to_string(),
            });
        } else if line.starts_with('-') && !line.starts_with("---") {
            entry.1 += 1;
            entry.2.push(DiffLine {
                kind: "remove".to_string(),
                content: line[1..].to_string(),
            });
        } else if line.starts_with(' ') {
            entry.2.push(DiffLine {
                kind: "context".to_string(),
                content: line[1..].to_string(),
            });
        }
    }

    let mut records = Vec::new();
    for (file_path, (additions, deletions, diff_lines)) in per_file {
        if additions == 0 && deletions == 0 {
            continue;
        }
        let diff_content = if diff_lines.is_empty() {
            None
        } else {
            Some(DiffContent::Patch { lines: diff_lines })
        };
        records.push(NormalizedRecord::CodeChange(CodeChangeRecord {
            timestamp,
            file_path: file_path.clone(),
            extension: file_extension(&file_path),
            additions,
            deletions,
            files: 1,
            diff_content,
        }));
    }
    records
}

fn backfill_unknown_token_models(records: &mut [NormalizedRecord], model: &str) {
    for record in records {
        if let NormalizedRecord::Token(token) = record {
            if token.model == "unknown" {
                token.model = model.to_string();
            }
        }
    }
}

fn file_extension(file_path: &str) -> String {
    Path::new(file_path)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("unknown")
        .to_ascii_lowercase()
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

fn codex_home_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".codex"))
}

fn codex_sessions_dir() -> Option<PathBuf> {
    let dir = codex_home_dir()?.join("sessions");
    if dir.is_dir() {
        Some(dir)
    } else {
        None
    }
}

fn codex_sqlite_path() -> Option<PathBuf> {
    let path = codex_home_dir()?.join("state_5.sqlite");
    if path.is_file() {
        Some(path)
    } else {
        None
    }
}

/// Check if a path looks like a Codex JSONL session file (rollout-*.jsonl).
fn is_codex_jsonl(path: &Path) -> bool {
    let name = match path.file_name().and_then(|n| n.to_str()) {
        Some(n) => n,
        None => return false,
    };
    name.starts_with("rollout-") && name.ends_with(".jsonl")
}

// ---------------------------------------------------------------------------
// Time filtering (file modification time)
// ---------------------------------------------------------------------------

fn filter_by_mtime(time_filter: &TimeFilter, path: &Path) -> bool {
    if matches!(time_filter, TimeFilter::All) {
        return true;
    }
    let metadata = match fs::metadata(path) {
        Ok(m) => m,
        Err(_) => return false,
    };
    let modified: DateTime<Local> = match metadata.modified() {
        Ok(t) => t.into(),
        Err(_) => return false,
    };
    let now = Local::now();
    match time_filter {
        TimeFilter::Today => {
            let today_start = now.date_naive().and_hms_opt(0, 0, 0).unwrap();
            let today_start_local = Local.from_local_datetime(&today_start).unwrap();
            modified >= today_start_local
        }
        TimeFilter::Week => modified >= now - Duration::days(7),
        TimeFilter::Month => modified >= now - Duration::days(30),
        TimeFilter::Days(d) => modified >= now - Duration::days(*d as i64),
        TimeFilter::All => true,
    }
}

// ---------------------------------------------------------------------------
// JSONL parsing
// ---------------------------------------------------------------------------

/// Parse a single Codex JSONL session file and return aggregated SessionStats.
fn parse_codex_jsonl(path: &Path) -> Option<SessionStats> {
    let file = fs::File::open(path).ok()?;
    let reader = BufReader::new(file);

    let mut stats = SessionStats::default();
    stats.source = "codex".to_string();

    // Extract session id from filename: rollout-<id>.jsonl
    if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
        stats.session_id = Some(stem.to_string());
    }

    // Accumulate last token_count values (they are cumulative)
    let mut last_input: u64 = 0;
    let mut last_cached_input: u64 = 0;
    let mut last_output: u64 = 0;
    let mut last_reasoning_output: u64 = 0;

    let mut first_ts: Option<DateTime<Utc>> = None;
    let mut last_ts: Option<DateTime<Utc>> = None;

    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => continue,
        };
        if line.trim().is_empty() {
            continue;
        }
        let value: serde_json::Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        // Track timestamps for duration estimation
        if let Some(ts_str) = value.get("timestamp").and_then(|v| v.as_str()) {
            if let Ok(dt) = DateTime::parse_from_rfc3339(ts_str) {
                let dt_utc = dt.with_timezone(&Utc);
                if first_ts.is_none() {
                    first_ts = Some(dt_utc);
                    stats.first_timestamp = Some(ts_str.to_string());
                }
                last_ts = Some(dt_utc);
            }
        }

        let event_type = value.get("type").and_then(|v| v.as_str()).unwrap_or("");

        match event_type {
            "session_meta" => {
                parse_session_meta(&value, &mut stats);
            }
            "event_msg" => {
                // Check for token_count sub-type
                let payload_type = value
                    .pointer("/payload/type")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                if payload_type == "token_count" {
                    if let Some(usage) = value.pointer("/payload/info/total_token_usage") {
                        let input = usage
                            .get("input_tokens")
                            .and_then(|v| v.as_u64())
                            .unwrap_or(0);
                        let cached = usage
                            .get("cached_input_tokens")
                            .and_then(|v| v.as_u64())
                            .unwrap_or(0);
                        let output = usage
                            .get("output_tokens")
                            .and_then(|v| v.as_u64())
                            .unwrap_or(0);
                        let reasoning = usage
                            .get("reasoning_output_tokens")
                            .and_then(|v| v.as_u64())
                            .unwrap_or(0);

                        // Keep the last (cumulative) values
                        last_input = input;
                        last_cached_input = cached;
                        last_output = output;
                        last_reasoning_output = reasoning;
                    }
                }
            }
            "turn_context" => {
                // Extract model name
                if let Some(model) = value.pointer("/payload/model").and_then(|v| v.as_str()) {
                    if stats.primary_model.is_none() {
                        stats.primary_model = Some(model.to_string());
                    }
                }
            }
            "response_item" => {
                // Count user role items as instructions
                let role = value
                    .pointer("/payload/role")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                if role == "user" {
                    stats.instructions += 1;
                    stats.has_activity = true;
                }
            }
            "function_call" => {
                // Count tool usage
                if let Some(name) = value.pointer("/payload/name").and_then(|v| v.as_str()) {
                    *stats.tool_usage.entry(name.to_string()).or_insert(0) += 1;
                    stats.has_activity = true;
                }
            }
            _ => {}
        }
    }

    // Apply cumulative token counts
    // OpenAI's input_tokens INCLUDES cached_input_tokens, so deduct to avoid double-counting
    // input_tokens - cached_input_tokens -> tokens.input (non-cached only)
    // cached_input_tokens -> tokens.cache_read
    // output_tokens + reasoning_output_tokens -> tokens.output
    // cache_creation = 0
    stats.tokens.input = last_input.saturating_sub(last_cached_input);
    stats.tokens.cache_read = last_cached_input;
    stats.tokens.output = last_output + last_reasoning_output;
    stats.tokens.cache_creation = 0;

    if last_input > 0 || last_output > 0 {
        stats.has_activity = true;
    }

    // Populate by_model with the primary model
    if let Some(ref model) = stats.primary_model {
        let cost = crate::parser::calculate_cost_for_source("codex",
            model,
            stats.tokens.input,
            stats.tokens.output,
            stats.tokens.cache_read,
            stats.tokens.cache_creation,
        );
        let model_tokens = stats.tokens.by_model.entry(model.clone()).or_default();
        model_tokens.input = stats.tokens.input;
        model_tokens.output = stats.tokens.output;
        model_tokens.cache_read = stats.tokens.cache_read;
        model_tokens.cache_creation = 0;
        model_tokens.cost_usd = cost;
        stats.cost_usd = cost;
    }

    // Estimate duration from first/last timestamp
    if let (Some(first), Some(last)) = (first_ts, last_ts) {
        let diff = last - first;
        stats.duration_ms = diff.num_milliseconds().max(0) as u64;
    }

    Some(stats)
}

/// Extract metadata from the `session_meta` event.
fn parse_session_meta(value: &serde_json::Value, stats: &mut SessionStats) {
    let payload = match value.get("payload") {
        Some(p) => p,
        None => return,
    };

    if let Some(id) = payload.get("id").and_then(|v| v.as_str()) {
        stats.session_id = Some(id.to_string());
    }

    if let Some(cwd) = payload.get("cwd").and_then(|v| v.as_str()) {
        stats.cwd = Some(cwd.to_string());
    }

    if let Some(version) = payload.get("cli_version").and_then(|v| v.as_str()) {
        stats.version = Some(version.to_string());
    }

    if let Some(branch) = payload.pointer("/git/branch").and_then(|v| v.as_str()) {
        stats.git_branch = Some(branch.to_string());
    }
}

/// Read the first few lines of a JSONL to get the project cwd, then derive
/// (display_name, cwd_path).
fn extract_project_from_jsonl(path: &Path) -> Option<(String, String)> {
    let file = fs::File::open(path).ok()?;
    let reader = BufReader::new(file);

    for line in reader.lines().take(5) {
        let line = line.ok()?;
        if line.trim().is_empty() {
            continue;
        }
        let value: serde_json::Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };
        if value.get("type").and_then(|v| v.as_str()) != Some("session_meta") {
            continue;
        }
        let cwd = value.pointer("/payload/cwd").and_then(|v| v.as_str())?;
        let name = project_name_from_cwd(cwd);
        return Some((name, cwd.to_string()));
    }
    None
}

// ---------------------------------------------------------------------------
// Project name detection
// ---------------------------------------------------------------------------

/// Walk up from `cwd` to find a project root marker, then use that directory's
/// name as the project display name.
fn project_name_from_cwd(cwd: &str) -> String {
    let path = Path::new(cwd);
    let root = path
        .ancestors()
        .find(|ancestor| {
            ancestor.join(".git").exists()
                || ancestor.join("package.json").exists()
                || ancestor.join("Cargo.toml").exists()
                || ancestor.join("pnpm-lock.yaml").exists()
        })
        .unwrap_or(path);

    root.file_name()
        .and_then(|n| n.to_str())
        .filter(|n| !n.is_empty())
        .unwrap_or("unknown")
        .to_string()
}

// ---------------------------------------------------------------------------
// Filtering helpers
// ---------------------------------------------------------------------------

fn matches_project(project: Option<&[String]>, session: &SessionStats) -> bool {
    let name = session_project_name(session);
    project_matches_filters(project, &name)
}

fn session_project_name(session: &SessionStats) -> String {
    match session.cwd.as_deref() {
        Some(cwd) => project_name_from_cwd(cwd),
        None => "unknown".to_string(),
    }
}

/// Check whether at least one model in the session matches the requested provider.
fn matches_provider(
    provider_filter: &Option<Vec<String>>,
    session: &SessionStats,
    custom_providers: &[CustomProviderDef],
) -> bool {
    session
        .tokens
        .by_model
        .keys()
        .any(|m| model_matches_provider_filters(m, provider_filter.as_deref(), custom_providers))
}

// ---------------------------------------------------------------------------
// Provider resolution — delegates to shared crate::commands functions
// ---------------------------------------------------------------------------

fn model_to_provider(model: &str, custom_providers: &[CustomProviderDef]) -> Option<String> {
    crate::commands::model_to_provider(model, custom_providers)
}

// ---------------------------------------------------------------------------
// Convert SessionStats -> SessionInfo
// ---------------------------------------------------------------------------

fn session_stats_to_info(session: SessionStats, project_name: &str) -> SessionInfo {
    let total_tokens = session.tokens.input
        + session.tokens.output
        + session.tokens.cache_read
        + session.tokens.cache_creation;

    SessionInfo {
        session_id: session.session_id.unwrap_or_else(|| "unknown".to_string()),
        project_name: project_name.to_string(),
        timestamp: session.first_timestamp.unwrap_or_default(),
        duration_ms: session.duration_ms,
        duration_formatted: format_duration(session.duration_ms),
        total_tokens,
        instructions: session.instructions,
        model: session
            .primary_model
            .unwrap_or_else(|| "unknown".to_string()),
        git_branch: session.git_branch.unwrap_or_default(),
        cost_usd: session.cost_usd,
        source: "codex".to_string(),
        input: session.tokens.input,
        output: session.tokens.output,
        cache_read: session.tokens.cache_read,
        cache_creation: session.tokens.cache_creation,
        tokens_by_model: session.tokens.by_model.clone(),
    }
}

// ---------------------------------------------------------------------------
// SQLite fallback
// ---------------------------------------------------------------------------

fn open_sqlite(db_path: &Path) -> Option<Connection> {
    Connection::open_with_flags(db_path, OpenFlags::SQLITE_OPEN_READ_ONLY).ok()
}

/// Query distinct projects from the SQLite database.
fn query_sqlite_projects(db_path: &Path) -> Result<Vec<(String, String)>, ()> {
    let conn = open_sqlite(db_path).ok_or(())?;
    let mut stmt = conn
        .prepare("SELECT DISTINCT cwd FROM threads WHERE cwd IS NOT NULL AND cwd != ''")
        .map_err(|_| ())?;

    let rows = stmt
        .query_map([], |row| {
            let cwd: String = row.get(0)?;
            Ok(cwd)
        })
        .map_err(|_| ())?;

    let mut results: Vec<(String, String)> = Vec::new();
    let mut seen: HashMap<String, bool> = HashMap::new();

    for row in rows {
        let cwd = match row {
            Ok(c) => c,
            Err(_) => continue,
        };
        let name = project_name_from_cwd(&cwd);
        if seen.contains_key(&name) {
            continue;
        }
        seen.insert(name.clone(), true);
        results.push((name, cwd));
    }

    Ok(results)
}

/// Query sessions from the SQLite database, applying project and time filters.
fn query_sqlite_sessions(
    db_path: &Path,
    project: Option<&[String]>,
    time_filter: &TimeFilter,
) -> Result<Vec<SessionStats>, ()> {
    let conn = open_sqlite(db_path).ok_or(())?;

    // Build the cutoff unix timestamp for time filtering
    let cutoff_ts = time_filter_to_unix(time_filter);

    let mut sql = String::from(
        "SELECT id, cwd, title, tokens_used, model, git_branch, \
         model_provider, cli_version, source, created_at, updated_at \
         FROM threads WHERE 1=1",
    );
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(cutoff) = cutoff_ts {
        sql.push_str(" AND created_at >= ?");
        params.push(Box::new(cutoff));
    }

    let mut stmt = conn.prepare(&sql).map_err(|_| ())?;

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let rows = stmt
        .query_map(param_refs.as_slice(), |row| {
            let id: String = row.get(0)?;
            let cwd: Option<String> = row.get(1)?;
            let _title: Option<String> = row.get(2)?;
            let tokens_used: Option<i64> = row.get(3)?;
            let model: Option<String> = row.get(4)?;
            let git_branch: Option<String> = row.get(5)?;
            let _model_provider: Option<String> = row.get(6)?;
            let cli_version: Option<String> = row.get(7)?;
            let _source: Option<String> = row.get(8)?;
            let created_at: Option<i64> = row.get(9)?;
            let updated_at: Option<i64> = row.get(10)?;

            Ok((
                id,
                cwd,
                tokens_used,
                model,
                git_branch,
                cli_version,
                created_at,
                updated_at,
            ))
        })
        .map_err(|_| ())?;

    let mut sessions: Vec<SessionStats> = Vec::new();

    for row in rows {
        let (id, cwd, tokens_used, model, git_branch, cli_version, created_at, updated_at) =
            match row {
                Ok(r) => r,
                Err(_) => continue,
            };

        // Project filter
        if let Some(wanted_projects) = project {
            let name = cwd
                .as_deref()
                .map(project_name_from_cwd)
                .unwrap_or_else(|| "unknown".to_string());
            if !project_matches_filters(Some(wanted_projects), &name) {
                continue;
            }
        }

        let tokens_total = tokens_used.unwrap_or(0).max(0) as u64;

        // Rough split: assume 80% input, 20% output when we only have a total
        let input_tokens = (tokens_total as f64 * 0.8) as u64;
        let output_tokens = tokens_total - input_tokens;

        let mut stats = SessionStats::default();
        stats.source = "codex".to_string();
        stats.session_id = Some(id);
        stats.cwd = cwd;
        stats.git_branch = git_branch;
        stats.version = cli_version;
        stats.primary_model = model.clone();
        stats.has_activity = tokens_total > 0;
        stats.tokens.input = input_tokens;
        stats.tokens.output = output_tokens;

        if let Some(ref m) = model {
            let cost = crate::parser::calculate_cost_for_source("codex",m, input_tokens, output_tokens, 0, 0);
            stats.cost_usd = cost;
            let mt = stats.tokens.by_model.entry(m.clone()).or_default();
            mt.input = input_tokens;
            mt.output = output_tokens;
            mt.cost_usd = cost;
        }

        // Timestamp
        if let Some(ts) = created_at {
            if let Some(dt) = DateTime::from_timestamp(ts, 0) {
                stats.first_timestamp = Some(dt.to_rfc3339());
            }
        }

        // Duration estimate
        if let (Some(c), Some(u)) = (created_at, updated_at) {
            let diff = (u - c).max(0) as u64;
            stats.duration_ms = diff * 1000;
        }

        sessions.push(stats);
    }

    Ok(sessions)
}

/// Query Codex usage directly from the SQLite threads table for account usage.
/// Returns (request_count, total_tokens, earliest_created_at_unix) for a given time window.
pub fn query_codex_thread_usage(hours: i64) -> Option<(u32, u64, Option<i64>)> {
    let db_path = codex_sqlite_path()?;
    let conn = open_sqlite(&db_path)?;
    let cutoff = Local::now().timestamp() - hours * 3600;
    let mut stmt = conn
        .prepare(
            "SELECT COUNT(*), COALESCE(SUM(tokens_used), 0), MIN(created_at) \
             FROM threads WHERE created_at >= ?1",
        )
        .ok()?;
    let result = stmt
        .query_row([cutoff], |row| {
            let count: i64 = row.get(0)?;
            let tokens: i64 = row.get(1)?;
            let earliest: Option<i64> = row.get(2)?;
            Ok((count as u32, tokens.max(0) as u64, earliest))
        })
        .ok()?;
    Some(result)
}

/// Convert a TimeFilter into a Unix timestamp cutoff (seconds), or None for All.
fn time_filter_to_unix(time_filter: &TimeFilter) -> Option<i64> {
    let now = Local::now();
    let cutoff = match time_filter {
        TimeFilter::Today => {
            let today_start = now.date_naive().and_hms_opt(0, 0, 0).unwrap();
            Local.from_local_datetime(&today_start).unwrap()
        }
        TimeFilter::Week => now - Duration::days(7),
        TimeFilter::Month => now - Duration::days(30),
        TimeFilter::Days(d) => now - Duration::days(*d as i64),
        TimeFilter::All => return None,
    };
    Some(cutoff.timestamp())
}
