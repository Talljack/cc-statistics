use crate::models::*;
use crate::normalized::{InstructionRecord, NormalizedRecord, NormalizedSession, TokenRecord, ToolRecord};
use crate::classification::{classify_tool_call, ToolCallChain};
use crate::parser::{ProjectStats, SessionStats, format_duration};
use crate::commands::{model_matches_provider, model_to_provider, CustomProviderDef};
use chrono::{DateTime, Duration, FixedOffset, Local, TimeZone};
use std::collections::HashMap;
use std::path::PathBuf;
use std::io::{BufRead, BufReader};
use std::fs;
use serde_json::Value;

/// Return the base sessions directory: ~/.openclaw/agents/main/sessions
fn sessions_dir() -> Option<PathBuf> {
    let home = dirs::home_dir()?;
    let dir = home.join(".openclaw").join("agents").join("main").join("sessions");
    if dir.is_dir() {
        Some(dir)
    } else {
        None
    }
}

/// Discover all projects from Openclaw session files.
/// Returns (project_name, project_path) pairs derived from the session `cwd`.
pub fn discover_projects() -> Vec<(String, String)> {
    let dir = match sessions_dir() {
        Some(d) => d,
        None => return Vec::new(),
    };

    let entries = match fs::read_dir(&dir) {
        Ok(e) => e,
        Err(_) => return Vec::new(),
    };

    let mut seen: HashMap<String, String> = HashMap::new();

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
            continue;
        }

        // Try to extract cwd from the first "session" line
        if let Some((name, cwd)) = extract_project_from_file(&path) {
            seen.entry(name).or_insert(cwd);
        }
    }

    let mut results: Vec<(String, String)> = seen.into_iter().collect();
    results.sort_by(|a, b| a.0.cmp(&b.0));
    results
}

pub fn collect_normalized_sessions(
    project: Option<&str>,
    query_range: &QueryTimeRange,
) -> Vec<NormalizedSession> {
    let dir = match sessions_dir() {
        Some(dir) => dir,
        None => return Vec::new(),
    };

    let entries = match fs::read_dir(&dir) {
        Ok(entries) => entries,
        Err(_) => return Vec::new(),
    };

    let mut sessions = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
            continue;
        }

        if !crate::time_ranges::filter_by_query_range(query_range, &path) {
            continue;
        }

        if let Some(session) = parse_normalized_openclaw_session(&path) {
            let session_project = session.project_name.clone();
            if let Some(wanted) = project {
                if session_project != wanted {
                    continue;
                }
            }
            sessions.push(session);
        }
    }

    sessions.sort_by(|a, b| {
        let a_ts = a
            .records
            .first()
            .map(|record| record.timestamp().to_rfc3339())
            .unwrap_or_default();
        let b_ts = b
            .records
            .first()
            .map(|record| record.timestamp().to_rfc3339())
            .unwrap_or_default();
        b_ts.cmp(&a_ts)
    });

    sessions
}

/// Read the first few lines of a JSONL file and extract (project_name, cwd).
fn extract_project_from_file(path: &PathBuf) -> Option<(String, String)> {
    let file = fs::File::open(path).ok()?;
    let reader = BufReader::new(file);

    for line in reader.lines().take(5).flatten() {
        let value: serde_json::Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        if value.get("type").and_then(|v| v.as_str()) != Some("session") {
            continue;
        }

        let cwd_str = value.get("cwd").and_then(|v| v.as_str())?;
        let cwd = PathBuf::from(cwd_str);

        let name = find_project_name(&cwd);
        return Some((name, cwd_str.to_string()));
    }

    None
}

/// Walk up from `cwd` to find a git/project root directory and return its name.
fn find_project_name(cwd: &PathBuf) -> String {
    let root = cwd
        .ancestors()
        .find(|ancestor| {
            ancestor.join(".git").exists()
                || ancestor.join("package.json").exists()
                || ancestor.join("Cargo.toml").exists()
                || ancestor.join("pnpm-lock.yaml").exists()
                || ancestor.join("go.mod").exists()
                || ancestor.join("pyproject.toml").exists()
        })
        .unwrap_or(cwd.as_path());

    root.file_name()
        .and_then(|n| n.to_str())
        .filter(|n| !n.is_empty())
        .unwrap_or("unknown")
        .to_string()
}

/// Check whether a file's mtime passes the time filter (quick pre-filter).
fn file_passes_time_filter(path: &PathBuf, time_filter: &TimeFilter) -> bool {
    if matches!(time_filter, TimeFilter::All) {
        return true;
    }

    let metadata = match fs::metadata(path) {
        Ok(m) => m,
        Err(_) => return false,
    };

    let modified = match metadata.modified() {
        Ok(t) => t,
        Err(_) => return false,
    };

    let now = Local::now();
    let datetime: DateTime<Local> = modified.into();

    match time_filter {
        TimeFilter::Today => {
            let today_start = now.date_naive().and_hms_opt(0, 0, 0).unwrap();
            let today_start_local = Local.from_local_datetime(&today_start).unwrap();
            datetime >= today_start_local
        }
        TimeFilter::Week => datetime >= now - Duration::days(7),
        TimeFilter::Month => datetime >= now - Duration::days(30),
        TimeFilter::Days(d) => datetime >= now - Duration::days(*d as i64),
        TimeFilter::All => true,
    }
}

/// Check whether a record's ISO timestamp passes the time filter.
fn record_passes_time_filter(timestamp: &str, time_filter: &TimeFilter) -> bool {
    if matches!(time_filter, TimeFilter::All) {
        return true;
    }

    let record_time = match DateTime::parse_from_rfc3339(timestamp) {
        Ok(t) => t.with_timezone(&Local),
        Err(_) => return false, // skip records with invalid timestamps for time-specific filters
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
        TimeFilter::Days(d) => record_time >= now - Duration::days(*d as i64),
        TimeFilter::All => true,
    }
}

/// Collect aggregated statistics across matching Openclaw sessions.
pub fn collect_stats(
    project: Option<&str>,
    time_filter: &TimeFilter,
    provider_filter: &Option<String>,
    custom_providers: &[CustomProviderDef],
) -> ProjectStats {
    let mut combined = ProjectStats::default();

    let dir = match sessions_dir() {
        Some(d) => d,
        None => return combined,
    };

    let entries = match fs::read_dir(&dir) {
        Ok(e) => e,
        Err(_) => return combined,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
            continue;
        }

        if !file_passes_time_filter(&path, time_filter) {
            continue;
        }

        let session = match parse_openclaw_session(&path, time_filter) {
            Some(s) if s.has_activity => s,
            _ => continue,
        };

        // Project filter
        if let Some(proj) = project {
            let session_project = session
                .cwd
                .as_ref()
                .map(|c| find_project_name(&PathBuf::from(c)))
                .unwrap_or_default();
            if session_project != proj {
                continue;
            }
        }

        // Provider filter
        if let Some(ref provider) = provider_filter {
            let matches = session
                .tokens
                .by_model
                .keys()
                .any(|m| model_matches_provider(m, provider, custom_providers));
            if !matches {
                continue;
            }
        }

        combined.merge_session(session);
    }

    combined
}

/// Collect individual session info from Openclaw session files.
pub fn collect_sessions(
    project: Option<&str>,
    time_filter: &TimeFilter,
    provider_filter: &Option<String>,
    custom_providers: &[CustomProviderDef],
) -> Vec<SessionInfo> {
    let mut sessions: Vec<SessionInfo> = Vec::new();

    let dir = match sessions_dir() {
        Some(d) => d,
        None => return sessions,
    };

    let entries = match fs::read_dir(&dir) {
        Ok(e) => e,
        Err(_) => return sessions,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
            continue;
        }

        if !file_passes_time_filter(&path, time_filter) {
            continue;
        }

        let session = match parse_openclaw_session(&path, time_filter) {
            Some(s) if s.has_activity => s,
            _ => continue,
        };

        let project_name = session
            .cwd
            .as_ref()
            .map(|c| find_project_name(&PathBuf::from(c)))
            .unwrap_or_else(|| "unknown".to_string());

        // Project filter
        if let Some(proj) = project {
            if project_name != proj {
                continue;
            }
        }

        // Provider filter
        if let Some(ref provider) = provider_filter {
            let matches = session
                .tokens
                .by_model
                .keys()
                .any(|m| model_matches_provider(m, provider, custom_providers));
            if !matches {
                continue;
            }
        }

        let total_tokens = session.tokens.input
            + session.tokens.output
            + session.tokens.cache_read
            + session.tokens.cache_creation;

        // Skip empty sessions
        if total_tokens == 0 && session.instructions == 0 && session.duration_ms == 0 {
            continue;
        }

        sessions.push(SessionInfo {
            session_id: session.session_id.unwrap_or_else(|| "unknown".to_string()),
            project_name,
            timestamp: session.first_timestamp.unwrap_or_default(),
            duration_ms: session.duration_ms,
            duration_formatted: format_duration(session.duration_ms),
            total_tokens,
            instructions: session.instructions,
            model: session.primary_model.unwrap_or_else(|| "unknown".to_string()),
            git_branch: session.git_branch.unwrap_or_default(),
            cost_usd: session.cost_usd,
            source: "openclaw".to_string(),
            input: session.tokens.input,
            output: session.tokens.output,
            cache_read: session.tokens.cache_read,
            cache_creation: session.tokens.cache_creation,
            tokens_by_model: session.tokens.by_model.clone(),
        });
    }

    sessions.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    sessions
}

/// Parse a single Openclaw JSONL session file into SessionStats.
fn parse_normalized_openclaw_session(path: &PathBuf) -> Option<NormalizedSession> {
    let file = fs::File::open(path).ok()?;
    let reader = BufReader::new(file);

    let mut source_session_id = path.file_stem().and_then(|s| s.to_str()).unwrap_or("unknown").to_string();
    let mut project_name = "unknown".to_string();
    let mut current_model: Option<String> = None;
    let mut records: Vec<NormalizedRecord> = Vec::new();

    for line in reader.lines() {
        let line = match line {
            Ok(line) => line,
            Err(_) => continue,
        };
        if line.trim().is_empty() {
            continue;
        }

        let value: Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let record_type = value.get("type").and_then(|v| v.as_str()).unwrap_or("");
        let timestamp = match value.get("timestamp").and_then(|v| v.as_str()).and_then(parse_fixed_offset_timestamp) {
            Some(ts) => ts,
            None => continue,
        };

        match record_type {
            "session" => {
                if let Some(id) = value.get("id").and_then(|v| v.as_str()) {
                    source_session_id = id.to_string();
                }
                if let Some(session_cwd) = value.get("cwd").and_then(|v| v.as_str()) {
                    project_name = find_project_name(&PathBuf::from(session_cwd));
                }
            }
            "model_change" => {
                if let Some(model_id) = value.get("modelId").and_then(|v| v.as_str()) {
                    current_model = Some(model_id.to_string());
                }
            }
            "message" => {
                let message = match value.get("message") {
                    Some(message) => message,
                    None => continue,
                };

                let role = message.get("role").and_then(|v| v.as_str()).unwrap_or("");

                match role {
                    "user" => {
                        if let Some(content) = openclaw_user_content(message) {
                            if !content.trim().is_empty() {
                                records.push(NormalizedRecord::Instruction(InstructionRecord {
                                    timestamp,
                                    content,
                                }));
                            }
                        }
                    }
                    "assistant" => {
                        let model = message
                            .get("model")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string())
                            .or_else(|| current_model.clone())
                            .unwrap_or_else(|| "unknown".to_string());

                        let usage = match message.get("usage") {
                            Some(usage) => usage,
                            None => continue,
                        };

                        let input = usage.get("input").and_then(|v| v.as_u64()).unwrap_or(0);
                        let output = usage.get("output").and_then(|v| v.as_u64()).unwrap_or(0);
                        let cache_read = usage.get("cacheRead").and_then(|v| v.as_u64()).unwrap_or(0);
                        let cache_write = usage.get("cacheWrite").and_then(|v| v.as_u64()).unwrap_or(0);
                        let cost = usage
                            .get("cost")
                            .and_then(|c| c.get("total"))
                            .and_then(|v| v.as_f64())
                            .unwrap_or(0.0);

                        records.push(NormalizedRecord::Token(TokenRecord {
                            timestamp,
                            model: model.clone(),
                            input,
                            output,
                            cache_read,
                            cache_creation: cache_write,
                            cost_usd: if cost > 0.0 {
                                cost
                            } else {
                                crate::parser::calculate_cost(&model, input, output, cache_read, cache_write)
                            },
                        }));

                        if let Some(content) = message.get("content").and_then(|v| v.as_array()) {
                            for block in content {
                                if block.get("type").and_then(|v| v.as_str()) != Some("toolCall") {
                                    continue;
                                }
                                let name = match block.get("name").and_then(|v| v.as_str()) {
                                    Some(name) => name,
                                    None => continue,
                                };

                                let classification = classify_tool_call(
                                    "openclaw",
                                    name,
                                    block.get("input"),
                                    ToolCallChain::Direct,
                                );

                                records.push(NormalizedRecord::Tool(ToolRecord {
                                    timestamp,
                                    name: name.to_string(),
                                    skill_name: classification.skill_name,
                                    mcp_name: classification.mcp_name,
                                }));
                            }
                        }
                    }
                    _ => {}
                }
            }
            _ => {}
        }
    }

    if records.is_empty() {
        return None;
    }

    let primary_model = records.iter().find_map(|record| match record {
        NormalizedRecord::Token(token) if token.model != "unknown" => Some(token.model.clone()),
        _ => None,
    }).or(current_model);

    let provider = primary_model
        .as_deref()
        .and_then(|model| model_to_provider(model, &[]));

    Some(NormalizedSession {
        source: "openclaw".to_string(),
        session_id: source_session_id,
        project_name,
        git_branch: None,
        primary_model,
        provider,
        records,
    })
}

fn parse_fixed_offset_timestamp(value: &str) -> Option<DateTime<FixedOffset>> {
    DateTime::parse_from_rfc3339(value).ok()
}

fn openclaw_user_content(message: &Value) -> Option<String> {
    let content = message.get("content")?;

    match content {
        Value::String(text) => {
            if text.starts_with("[Request interrupted") {
                None
            } else {
                Some(text.clone())
            }
        }
        Value::Array(items) => {
            let mut text = String::new();
            for item in items {
                if item.get("type").and_then(|v| v.as_str()) != Some("text") {
                    continue;
                }
                if let Some(part) = item.get("text").and_then(|v| v.as_str()) {
                    if part.starts_with("[Request interrupted") {
                        continue;
                    }
                    if !text.is_empty() {
                        text.push('\n');
                    }
                    text.push_str(part);
                }
            }
            if text.trim().is_empty() {
                None
            } else {
                Some(text)
            }
        }
        _ => None,
    }
}

/// Parse a single Openclaw JSONL session file into SessionStats.
fn parse_openclaw_session(path: &PathBuf, time_filter: &TimeFilter) -> Option<SessionStats> {
    let file = fs::File::open(path).ok()?;
    let reader = BufReader::new(file);

    let mut stats = SessionStats::default();
    stats.source = "openclaw".to_string();

    // Session ID from filename (UUID.jsonl)
    if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
        stats.session_id = Some(stem.to_string());
    }

    // Track the current model from model_change events
    let mut current_model: Option<String> = None;
    // Collect all timestamps to compute duration
    let mut timestamps: Vec<DateTime<Local>> = Vec::new();

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

        let record_type = value.get("type").and_then(|v| v.as_str()).unwrap_or("");

        // Extract timestamp for duration computation
        if let Some(ts_str) = value.get("timestamp").and_then(|v| v.as_str()) {
            if let Ok(dt) = DateTime::parse_from_rfc3339(ts_str) {
                timestamps.push(dt.with_timezone(&Local));
            }
        }

        match record_type {
            "session" => {
                // First line: session metadata
                if stats.cwd.is_none() {
                    if let Some(cwd) = value.get("cwd").and_then(|v| v.as_str()) {
                        stats.cwd = Some(cwd.to_string());
                    }
                }
                if stats.first_timestamp.is_none() {
                    if let Some(ts) = value.get("timestamp").and_then(|v| v.as_str()) {
                        stats.first_timestamp = Some(ts.to_string());
                    }
                }
                if let Some(id) = value.get("id").and_then(|v| v.as_str()) {
                    stats.session_id = Some(id.to_string());
                }
            }

            "model_change" => {
                // Track current model
                if let Some(model_id) = value.get("modelId").and_then(|v| v.as_str()) {
                    current_model = Some(model_id.to_string());
                    if stats.primary_model.is_none() {
                        stats.primary_model = Some(model_id.to_string());
                    }
                }
            }

            "message" => {
                // Record-level time filtering
                let ts_str = value.get("timestamp").and_then(|v| v.as_str()).unwrap_or("");
                if !record_passes_time_filter(ts_str, time_filter) {
                    continue;
                }

                let message = match value.get("message") {
                    Some(m) => m,
                    None => continue,
                };

                let role = message.get("role").and_then(|v| v.as_str()).unwrap_or("");

                match role {
                    "assistant" => {
                        stats.has_activity = true;
                        parse_assistant_message(message, &current_model, &mut stats);
                    }
                    "user" => {
                        if is_user_instruction(message) {
                            if record_passes_time_filter(ts_str, time_filter) {
                                stats.has_activity = true;
                                stats.instructions += 1;
                            }
                        }
                    }
                    _ => {}
                }
            }

            _ => {}
        }
    }

    // Compute session duration from first to last timestamp
    if timestamps.len() >= 2 {
        if let (Some(first), Some(last)) = (timestamps.first(), timestamps.last()) {
            let dur = *last - *first;
            stats.duration_ms = dur.num_milliseconds().max(0) as u64;
        }
    }

    Some(stats)
}

/// Parse an assistant message, extracting token usage, cost, model info, and tool calls.
fn parse_assistant_message(
    message: &serde_json::Value,
    current_model: &Option<String>,
    stats: &mut SessionStats,
) {
    // Determine the model for this message
    let model = message
        .get("model")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| current_model.clone());

    let model_str = model.as_deref().unwrap_or("unknown");

    // Set primary model if not yet set
    if stats.primary_model.is_none() {
        stats.primary_model = Some(model_str.to_string());
    }

    // Extract usage
    if let Some(usage) = message.get("usage") {
        let input = usage.get("input").and_then(|v| v.as_u64()).unwrap_or(0);
        let output = usage.get("output").and_then(|v| v.as_u64()).unwrap_or(0);
        let cache_read = usage.get("cacheRead").and_then(|v| v.as_u64()).unwrap_or(0);
        let cache_write = usage.get("cacheWrite").and_then(|v| v.as_u64()).unwrap_or(0);

        stats.tokens.input += input;
        stats.tokens.output += output;
        stats.tokens.cache_read += cache_read;
        stats.tokens.cache_creation += cache_write;

        let model_tokens = stats.tokens.by_model.entry(model_str.to_string()).or_default();
        model_tokens.input += input;
        model_tokens.output += output;
        model_tokens.cache_read += cache_read;
        model_tokens.cache_creation += cache_write;

        // Extract cost directly from usage.cost.total, fallback to calculate_cost
        let cost = usage
            .get("cost")
            .and_then(|c| c.get("total"))
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);

        if cost > 0.0 {
            model_tokens.cost_usd += cost;
            stats.cost_usd += cost;
        } else {
            let calc_cost = crate::parser::calculate_cost(
                model_str, input, output, cache_read, cache_write,
            );
            model_tokens.cost_usd += calc_cost;
            stats.cost_usd += calc_cost;
        }
    }

    // Extract tool usage from content blocks
    if let Some(content) = message.get("content").and_then(|v| v.as_array()) {
        for block in content {
            let block_type = block.get("type").and_then(|v| v.as_str()).unwrap_or("");

            if block_type == "toolCall" {
                // Count tool usage
                if let Some(name) = block.get("name").and_then(|v| v.as_str()) {
                    *stats.tool_usage.entry(name.to_string()).or_insert(0) += 1;
                } else {
                    *stats.tool_usage.entry("unknown_tool".to_string()).or_insert(0) += 1;
                }
            }
        }
    }
}

/// Check if a user message constitutes an instruction (has non-empty text content).
fn is_user_instruction(message: &serde_json::Value) -> bool {
    let content = match message.get("content") {
        Some(c) => c,
        None => return false,
    };

    match content {
        serde_json::Value::String(text) => {
            !text.trim().is_empty() && !text.starts_with("[Request interrupted")
        }
        serde_json::Value::Array(items) => items.iter().any(|item| {
            item.get("type").and_then(|v| v.as_str()) == Some("text")
                && item
                    .get("text")
                    .and_then(|v| v.as_str())
                    .map(|text| {
                        !text.trim().is_empty() && !text.starts_with("[Request interrupted")
                    })
                    .unwrap_or(false)
        }),
        _ => false,
    }
}
