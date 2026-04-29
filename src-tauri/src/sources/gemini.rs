use crate::commands::{
    model_matches_provider_filters, model_to_provider, project_matches_filters, CustomProviderDef,
};
use crate::models::*;
use crate::normalized::{InstructionRecord, NormalizedRecord, NormalizedSession, TokenRecord};
use crate::parser::{format_duration, ProjectStats, SessionStats};
use crate::time_ranges::record_matches_query_range;
use chrono::{DateTime, Duration, Local, TimeZone};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Discover all Gemini CLI projects.
/// Returns (project_display_name, project_path) pairs.
pub fn discover_projects() -> Vec<(String, String)> {
    let Some(root) = gemini_home_dir() else {
        return Vec::new();
    };
    discover_projects_from_root(&root)
}

pub fn discover_projects_from_root(root: &Path) -> Vec<(String, String)> {
    let mut seen: HashMap<String, String> = HashMap::new();

    // Scan ~/.gemini/tmp/{hash}/chats/ for session files
    if let Some(tmp_dir) = gemini_tmp_dir_from_root(root) {
        for entry in fs::read_dir(&tmp_dir).into_iter().flatten().flatten() {
            let hash_dir = entry.path();
            if !hash_dir.is_dir() {
                continue;
            }

            // Check if this hash dir has any session files
            let chats_dir = hash_dir.join("chats");
            if !chats_dir.is_dir() || !has_session_files(&chats_dir) {
                continue;
            }

            // Read .project_root to get project path
            if let Some((name, path)) = read_project_root(&hash_dir) {
                seen.entry(name).or_insert(path);
            }
        }
    }

    // Also check ~/.gemini/history/ for project mapping
    if let Some(history_dir) = gemini_history_dir_from_root(root) {
        for entry in fs::read_dir(&history_dir).into_iter().flatten().flatten() {
            let dir = entry.path();
            if !dir.is_dir() {
                continue;
            }
            if let Some((name, path)) = read_project_root(&dir) {
                seen.entry(name).or_insert(path);
            }
        }
    }

    seen.into_iter().collect()
}

/// Collect aggregate statistics across Gemini sessions.
pub fn collect_stats(
    project: Option<&[String]>,
    time_filter: &TimeFilter,
    provider_filter: &Option<Vec<String>>,
    custom_providers: &[CustomProviderDef],
) -> ProjectStats {
    let mut combined = ProjectStats::default();

    for path in find_all_session_files(time_filter) {
        let session = match parse_gemini_session(&path) {
            Some(s) => s,
            None => continue,
        };
        if !session.has_activity {
            continue;
        }
        if !session_matches_time(time_filter, &session) {
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

    combined
}

/// Collect individual session info entries from Gemini data.
pub fn collect_sessions(
    project: Option<&[String]>,
    time_filter: &TimeFilter,
    provider_filter: &Option<Vec<String>>,
    custom_providers: &[CustomProviderDef],
) -> Vec<SessionInfo> {
    let mut sessions: Vec<SessionInfo> = Vec::new();

    for path in find_all_session_files(time_filter) {
        let session = match parse_gemini_session(&path) {
            Some(s) => s,
            None => continue,
        };
        if !session.has_activity {
            continue;
        }
        if !session_matches_time(time_filter, &session) {
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

    // Sort by timestamp descending
    sessions.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    sessions
}

pub fn collect_normalized_sessions(
    project: Option<&[String]>,
    query_range: &QueryTimeRange,
) -> Vec<NormalizedSession> {
    let Some(root) = gemini_home_dir() else {
        return Vec::new();
    };
    collect_normalized_sessions_from_root(&root, project, query_range)
}

pub fn collect_normalized_sessions_from_home(
    home: &Path,
    project: Option<&[String]>,
    query_range: &QueryTimeRange,
) -> Vec<NormalizedSession> {
    collect_normalized_sessions_from_root(&home.join(".gemini"), project, query_range)
}

pub fn collect_normalized_sessions_from_root(
    root: &Path,
    project: Option<&[String]>,
    query_range: &QueryTimeRange,
) -> Vec<NormalizedSession> {
    let tmp_dir = root.join("tmp");
    collect_normalized_sessions_in_tmp(&tmp_dir, project, query_range)
}

fn collect_normalized_sessions_in_tmp(
    tmp_dir: &Path,
    project: Option<&[String]>,
    query_range: &QueryTimeRange,
) -> Vec<NormalizedSession> {
    let mut sessions = Vec::new();
    if !tmp_dir.is_dir() {
        return sessions;
    }

    for entry in WalkDir::new(tmp_dir)
        .into_iter()
        .filter_map(|entry| entry.ok())
    {
        let path = entry.path();
        if !is_gemini_session(path) {
            continue;
        }
        if !crate::time_ranges::filter_by_query_range(query_range, &path.to_path_buf()) {
            continue;
        }
        let Some(session) = parse_normalized_gemini_session(&path, project, query_range) else {
            continue;
        };
        if !session.records.is_empty() {
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

pub fn collect_instructions(
    project: Option<&[String]>,
    time_filter: &TimeFilter,
    _query_range: &Option<QueryTimeRange>,
    provider_filter: &Option<Vec<String>>,
    custom_providers: &[CustomProviderDef],
) -> Vec<InstructionInfo> {
    let mut instructions: Vec<InstructionInfo> = Vec::new();

    for path in find_all_session_files(time_filter) {
        let content = match fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };
        let root: serde_json::Value = match serde_json::from_str(&content) {
            Ok(v) => v,
            Err(_) => continue,
        };

        // Derive session_id
        let session_id = root
            .get("sessionId")
            .and_then(|v| v.as_str())
            .or_else(|| path.file_stem().and_then(|s| s.to_str()))
            .unwrap_or("unknown")
            .to_string();

        // Derive project_name from parent directory's .project_root
        let project_name = path
            .parent()
            .and_then(|chats_dir| chats_dir.parent())
            .and_then(|hash_dir| read_project_root(&hash_dir.to_path_buf()))
            .map(|(name, _)| name)
            .unwrap_or_else(|| "unknown".to_string());

        if !project_matches_filters(project, &project_name) {
            continue;
        }

        // Provider filter: parse session stats to check model
        if provider_filter.is_some() {
            let session = match parse_gemini_session(&path) {
                Some(s) => s,
                None => continue,
            };
            if !session
                .tokens
                .by_model
                .keys()
                .any(|m| model_matches_provider_filters(m, provider_filter.as_deref(), custom_providers))
                && provider_filter.is_some()
            {
                continue;
            }
        }

        // Fallback timestamp from session startTime
        let fallback_ts = root.get("startTime").and_then(|v| v.as_str()).unwrap_or("");

        let messages = match root.get("messages").and_then(|v| v.as_array()) {
            Some(msgs) => msgs,
            None => continue,
        };

        for msg in messages {
            let msg_type = msg.get("type").and_then(|v| v.as_str()).unwrap_or("");
            if msg_type != "user" {
                continue;
            }
            if !has_text_content(msg) {
                continue;
            }

            let text = user_content_text(msg);
            if text.is_empty() {
                continue;
            }

            let timestamp = msg
                .get("timestamp")
                .and_then(|v| v.as_str())
                .or_else(|| msg.get("time").and_then(|v| v.as_str()))
                .unwrap_or(fallback_ts)
                .to_string();

            let truncated: String = text.chars().take(200).collect();

            instructions.push(InstructionInfo {
                timestamp,
                project_name: project_name.clone(),
                instance_id: "built-in:gemini".to_string(),
                instance_label: "Default".to_string(),
                instance_root_path: "~/.gemini".to_string(),
                session_id: session_id.clone(),
                source: "gemini".to_string(),
                content: truncated,
            });
        }
    }

    instructions
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

fn gemini_home_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".gemini"))
}

fn gemini_tmp_dir() -> Option<PathBuf> {
    let root = gemini_home_dir()?;
    gemini_tmp_dir_from_root(&root)
}

fn gemini_tmp_dir_from_root(root: &Path) -> Option<PathBuf> {
    let dir = root.join("tmp");
    if dir.is_dir() {
        Some(dir)
    } else {
        None
    }
}

fn gemini_history_dir_from_root(root: &Path) -> Option<PathBuf> {
    let dir = root.join("history");
    if dir.is_dir() {
        Some(dir)
    } else {
        None
    }
}

/// Check if a directory contains any session-*.json files.
fn has_session_files(chats_dir: &PathBuf) -> bool {
    let entries = match fs::read_dir(chats_dir) {
        Ok(e) => e,
        Err(_) => return false,
    };
    for entry in entries.flatten() {
        if let Some(name) = entry.file_name().to_str() {
            if name.starts_with("session-") && name.ends_with(".json") {
                return true;
            }
        }
    }
    false
}

/// Read `.project_root` from a directory and derive (project_name, project_path).
fn read_project_root(dir: &PathBuf) -> Option<(String, String)> {
    let project_root_file = dir.join(".project_root");
    let content = fs::read_to_string(&project_root_file).ok()?;
    let project_path = content.trim().to_string();
    if project_path.is_empty() {
        return None;
    }
    let name = PathBuf::from(&project_path)
        .file_name()
        .and_then(|n| n.to_str())
        .filter(|n| !n.is_empty())
        .unwrap_or("unknown")
        .to_string();
    Some((name, project_path))
}

/// Collect all session-*.json file paths, applying mtime pre-filter.
fn find_all_session_files(time_filter: &TimeFilter) -> Vec<PathBuf> {
    let mut files: Vec<PathBuf> = Vec::new();

    let tmp_dir = match gemini_tmp_dir() {
        Some(d) => d,
        None => return files,
    };

    for entry in WalkDir::new(&tmp_dir).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if !is_gemini_session(path) {
            continue;
        }
        if !filter_by_mtime(time_filter, path) {
            continue;
        }
        files.push(path.to_path_buf());
    }

    files
}

/// Check if a path looks like a Gemini session file (session-*.json).
fn is_gemini_session(path: &std::path::Path) -> bool {
    let name = match path.file_name().and_then(|n| n.to_str()) {
        Some(n) => n,
        None => return false,
    };
    name.starts_with("session-") && name.ends_with(".json")
}

// ---------------------------------------------------------------------------
// Time filtering
// ---------------------------------------------------------------------------

/// Pre-filter by file modification time.
fn filter_by_mtime(time_filter: &TimeFilter, path: &std::path::Path) -> bool {
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

/// Check if a parsed session's startTime falls within the time filter.
fn session_matches_time(time_filter: &TimeFilter, session: &SessionStats) -> bool {
    if matches!(time_filter, TimeFilter::All) {
        return true;
    }
    let ts_str = match session.first_timestamp.as_deref() {
        Some(ts) => ts,
        None => return false, // no timestamp → exclude for time-specific filters
    };
    let record_time = match DateTime::parse_from_rfc3339(ts_str) {
        Ok(dt) => dt.with_timezone(&Local),
        Err(_) => return false, // invalid timestamp → exclude
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

// ---------------------------------------------------------------------------
// Session JSON parsing
// ---------------------------------------------------------------------------

/// Parse a single Gemini session-*.json file into SessionStats.
fn parse_gemini_session(path: &std::path::Path) -> Option<SessionStats> {
    let content = fs::read_to_string(path).ok()?;
    let root: serde_json::Value = serde_json::from_str(&content).ok()?;

    let mut stats = SessionStats::default();
    stats.source = "gemini".to_string();

    // Session ID
    if let Some(id) = root.get("sessionId").and_then(|v| v.as_str()) {
        stats.session_id = Some(id.to_string());
    } else if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
        stats.session_id = Some(stem.to_string());
    }

    // Derive project cwd from parent directory's .project_root
    // Path: ~/.gemini/tmp/{hash}/chats/session-*.json
    // .project_root lives at ~/.gemini/tmp/{hash}/.project_root
    if let Some(chats_dir) = path.parent() {
        if let Some(hash_dir) = chats_dir.parent() {
            if let Some((_, project_path)) = read_project_root(&hash_dir.to_path_buf()) {
                stats.cwd = Some(project_path);
            }
        }
    }

    // Timestamps
    let start_time_str = root.get("startTime").and_then(|v| v.as_str());
    let last_updated_str = root.get("lastUpdated").and_then(|v| v.as_str());

    if let Some(ts) = start_time_str {
        stats.first_timestamp = Some(ts.to_string());
    }

    // Duration: lastUpdated - startTime
    if let (Some(start_str), Some(end_str)) = (start_time_str, last_updated_str) {
        if let (Ok(start_dt), Ok(end_dt)) = (
            DateTime::parse_from_rfc3339(start_str),
            DateTime::parse_from_rfc3339(end_str),
        ) {
            let diff = end_dt - start_dt;
            stats.duration_ms = diff.num_milliseconds().max(0) as u64;
        }
    }

    // Parse messages
    let messages = match root.get("messages").and_then(|v| v.as_array()) {
        Some(msgs) => msgs,
        None => return Some(stats),
    };

    for msg in messages {
        let msg_type = msg.get("type").and_then(|v| v.as_str()).unwrap_or("");

        match msg_type {
            "user" => {
                // Count user messages as instructions
                if has_text_content(msg) {
                    stats.instructions += 1;
                    stats.has_activity = true;
                }
            }
            "gemini" => {
                parse_gemini_response(msg, &mut stats);
            }
            _ => {}
        }
    }

    // Calculate cost using model name and token counts
    for (model, mt) in stats.tokens.by_model.iter_mut() {
        let cost = crate::parser::calculate_cost_for_source("gemini",
            model,
            mt.input,
            mt.output,
            mt.cache_read,
            mt.cache_creation,
        );
        mt.cost_usd = cost;
        stats.cost_usd += cost;
    }

    Some(stats)
}

fn parse_normalized_gemini_session(
    path: &std::path::Path,
    project: Option<&[String]>,
    query_range: &QueryTimeRange,
) -> Option<NormalizedSession> {
    let content = fs::read_to_string(path).ok()?;
    let root: serde_json::Value = serde_json::from_str(&content).ok()?;

    let project_path = path
        .parent()
        .and_then(|chats_dir| chats_dir.parent())
        .and_then(|hash_dir| read_project_root(&hash_dir.to_path_buf()))
        .map(|(_, project_path)| project_path)?;
    let project_name = PathBuf::from(&project_path)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .unwrap_or("unknown")
        .to_string();

    if !project_matches_filters(project, &project_name) {
        return None;
    }

    let mut session = NormalizedSession {
        source: "gemini".to_string(),
        instance_id: "built-in:gemini".to_string(),
        instance_label: "Default".to_string(),
        instance_root_path: "~/.gemini".to_string(),
        session_id: root
            .get("sessionId")
            .and_then(|value| value.as_str())
            .or_else(|| path.file_stem().and_then(|stem| stem.to_str()))
            .unwrap_or("unknown")
            .to_string(),
        project_name,
        git_branch: None,
        primary_model: None,
        provider: None,
        records: Vec::new(),
    };

    let messages = root.get("messages").and_then(|value| value.as_array())?;
    let fallback_start = root.get("startTime").and_then(|value| value.as_str());

    for (index, message) in messages.iter().enumerate() {
        let timestamp = parse_gemini_message_timestamp(message).or_else(|| {
            if matches!(
                query_range,
                QueryTimeRange::BuiltIn {
                    key: BuiltInTimeRangeKey::All
                }
            ) {
                parse_gemini_message_timestamp_with_fallback(message, fallback_start, index == 0)
            } else {
                None
            }
        });
        let Some(timestamp) = timestamp else {
            continue;
        };
        let message_type = message
            .get("type")
            .and_then(|value| value.as_str())
            .unwrap_or("");

        match message_type {
            "user" => {
                if has_text_content(message) {
                    let content = user_content_text(message);
                    if !content.is_empty() {
                        let record =
                            NormalizedRecord::Instruction(InstructionRecord { timestamp, content });
                        if record_matches_query_range(query_range, record.timestamp()) {
                            session.records.push(record);
                        }
                    }
                }
            }
            "gemini" => {
                let model = message
                    .get("model")
                    .and_then(|value| value.as_str())
                    .unwrap_or("unknown")
                    .to_string();
                if session.primary_model.is_none() && model != "unknown" {
                    session.primary_model = Some(model.clone());
                    session.provider = model_to_provider(&model, &[]);
                }

                if let Some(tokens) = message.get("tokens") {
                    let input = tokens
                        .get("input")
                        .and_then(|value| value.as_u64())
                        .unwrap_or(0);
                    let output = tokens
                        .get("output")
                        .and_then(|value| value.as_u64())
                        .unwrap_or(0);
                    let thoughts = tokens
                        .get("thoughts")
                        .and_then(|value| value.as_u64())
                        .unwrap_or(0);
                    let cache_read = tokens
                        .get("cached")
                        .and_then(|value| value.as_u64())
                        .unwrap_or(0);
                    let output = output + thoughts;

                    if input + output + cache_read > 0 {
                        let cost_usd =
                            crate::parser::calculate_cost_for_source("gemini",&model, input, output, cache_read, 0);
                        let record = NormalizedRecord::Token(TokenRecord {
                            timestamp,
                            model,
                            input,
                            output,
                            cache_read,
                            cache_creation: 0,
                            cost_usd,
                        });
                        if record_matches_query_range(query_range, record.timestamp()) {
                            session.records.push(record);
                        }
                    }
                }
            }
            _ => {}
        }
    }

    if session.records.is_empty() {
        None
    } else {
        Some(session)
    }
}

/// Check whether a user message has non-empty text content.
fn has_text_content(msg: &serde_json::Value) -> bool {
    // content can be a string or an array of objects with "text" fields
    if let Some(content) = msg.get("content") {
        match content {
            serde_json::Value::String(text) => {
                return !text.trim().is_empty();
            }
            serde_json::Value::Array(items) => {
                return items.iter().any(|item| {
                    item.get("text")
                        .and_then(|v| v.as_str())
                        .map(|t| !t.trim().is_empty())
                        .unwrap_or(false)
                });
            }
            _ => {}
        }
    }
    false
}

fn user_content_text(msg: &serde_json::Value) -> String {
    if let Some(content) = msg.get("content") {
        match content {
            serde_json::Value::String(text) => return text.trim().to_string(),
            serde_json::Value::Array(items) => {
                let text = items
                    .iter()
                    .filter_map(|item| item.get("text").and_then(|value| value.as_str()))
                    .map(|value| value.trim())
                    .filter(|value| !value.is_empty())
                    .collect::<Vec<_>>()
                    .join("\n");
                return text;
            }
            _ => {}
        }
    }

    String::new()
}

fn parse_gemini_message_timestamp(
    msg: &serde_json::Value,
) -> Option<chrono::DateTime<chrono::FixedOffset>> {
    msg.get("timestamp")
        .and_then(|value| value.as_str())
        .or_else(|| msg.get("time").and_then(|value| value.as_str()))
        .and_then(|value| chrono::DateTime::parse_from_rfc3339(value).ok())
}

fn parse_gemini_message_timestamp_with_fallback(
    msg: &serde_json::Value,
    fallback_start: Option<&str>,
    is_first_message: bool,
) -> Option<chrono::DateTime<chrono::FixedOffset>> {
    parse_gemini_message_timestamp(msg).or_else(|| {
        if is_first_message {
            fallback_start.and_then(|value| chrono::DateTime::parse_from_rfc3339(value).ok())
        } else {
            None
        }
    })
}

/// Parse a gemini-type message for tokens and model information.
fn parse_gemini_response(msg: &serde_json::Value, stats: &mut SessionStats) {
    // Extract model
    let model = msg.get("model").and_then(|v| v.as_str()).unwrap_or("");

    // Extract token usage
    if let Some(tokens) = msg.get("tokens") {
        let input = tokens.get("input").and_then(|v| v.as_u64()).unwrap_or(0);
        let output_base = tokens.get("output").and_then(|v| v.as_u64()).unwrap_or(0);
        let cached = tokens.get("cached").and_then(|v| v.as_u64()).unwrap_or(0);
        let thoughts = tokens.get("thoughts").and_then(|v| v.as_u64()).unwrap_or(0);
        // tool tokens ignored (counted in input/output already)

        // Map: input -> input, output + thoughts -> output, cached -> cache_read, cache_creation = 0
        let output = output_base + thoughts;

        stats.tokens.input += input;
        stats.tokens.output += output;
        stats.tokens.cache_read += cached;
        // cache_creation stays 0

        if input > 0 || output > 0 {
            stats.has_activity = true;
        }

        // Track per-model tokens
        if !model.is_empty() {
            let model_tokens = stats.tokens.by_model.entry(model.to_string()).or_default();
            model_tokens.input += input;
            model_tokens.output += output;
            model_tokens.cache_read += cached;
        }
    }

    // Track primary model (first model seen)
    if stats.primary_model.is_none() && !model.is_empty() {
        stats.primary_model = Some(model.to_string());
    }
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
        Some(cwd) => PathBuf::from(cwd)
            .file_name()
            .and_then(|n| n.to_str())
            .filter(|n| !n.is_empty())
            .unwrap_or("unknown")
            .to_string(),
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
// Convert SessionStats -> SessionInfo
// ---------------------------------------------------------------------------

fn session_stats_to_info(session: SessionStats, project_name: &str) -> SessionInfo {
    let total_tokens = session.tokens.input
        + session.tokens.output
        + session.tokens.cache_read
        + session.tokens.cache_creation;

    SessionInfo {
        instance_id: "built-in:gemini".to_string(),
        instance_label: "Default".to_string(),
        instance_root_path: "~/.gemini".to_string(),
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
        source: "gemini".to_string(),
        input: session.tokens.input,
        output: session.tokens.output,
        cache_read: session.tokens.cache_read,
        cache_creation: session.tokens.cache_creation,
        tokens_by_model: session.tokens.by_model.clone(),
    }
}
