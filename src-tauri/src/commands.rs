use crate::models::*;
use crate::parser::{extract_instructions, format_duration, parse_session_file, ProjectStats};
use crate::sources;
use crate::time_ranges;
use chrono::{DateTime, Duration, Local, TimeZone};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::collections::HashSet;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomProviderDef {
    pub name: String,
    pub keyword: String,
}

/// Extract provider name from a model string.
/// Handles various formats: bare model names, slash-prefixed (openrouter/x-ai/grok-4),
/// antigravity proxy models, and custom provider keywords.
pub(crate) fn model_to_provider(model: &str, custom_providers: &[CustomProviderDef]) -> Option<String> {
    let m = model.to_lowercase();

    // Skip synthetic/internal/empty models
    if m.contains('<') || m.contains('>') || m.is_empty() || m == "unknown" {
        return None;
    }

    // Check custom providers first (user-defined take priority)
    for cp in custom_providers {
        if m.starts_with(&cp.keyword.to_lowercase()) {
            return Some(cp.name.clone());
        }
    }

    // Handle slash-prefixed model IDs (e.g. "x-ai/grok-4", "openrouter/x-ai/grok-4")
    // Strip routing prefixes and match the actual model name
    let effective = strip_routing_prefix(&m);

    // Antigravity proxy models: "antigravity-gemini-*" → Google Gemini, "antigravity-claude-*" → Anthropic
    if effective.starts_with("antigravity-") {
        let inner = &effective["antigravity-".len()..];
        if inner.starts_with("gemini") { return Some("Google Gemini".to_string()); }
        if inner.starts_with("claude") { return Some("Anthropic".to_string()); }
        // Other antigravity models → Google Gemini (default, since it's Google's proxy)
        return Some("Google Gemini".to_string());
    }

    // Known provider mappings (matched against effective model name)
    match_known_provider(effective)
}

/// Strip routing/platform prefixes from model IDs.
/// "openrouter/x-ai/grok-4" → "grok-4"
/// "x-ai/grok-4" → "grok-4"
/// "anthropic/claude-sonnet-4-5" → "claude-sonnet-4-5"
/// "google/gemini-3-pro" → "gemini-3-pro"
fn strip_routing_prefix(model: &str) -> &str {
    // Known routing/platform prefixes to strip
    let platform_prefixes = [
        "openrouter/", "together/", "groq/", "openrouter-", "together-", "groq-",
    ];
    let mut s = model;
    // Strip platform prefix first (e.g. "openrouter/")
    for prefix in &platform_prefixes {
        if let Some(rest) = s.strip_prefix(prefix) {
            s = rest;
            break;
        }
    }
    // Strip provider org prefix (e.g. "x-ai/", "anthropic/", "google/", "meta-llama/")
    let provider_org_prefixes = [
        "x-ai/", "anthropic/", "google/", "meta-llama/", "meta/", "mistralai/",
        "cohere/", "deepseek/", "qwen/", "microsoft/", "nvidia/", "01-ai/",
        "databricks/", "amazon/", "ai21/", "zhipu/", "moonshot/", "baichuan/",
        "bytedance/", "minimax/", "sensetime/", "cloudflare/", "aihubmix/",
        "custom-proxy/",
    ];
    for prefix in &provider_org_prefixes {
        if let Some(rest) = s.strip_prefix(prefix) {
            return rest;
        }
    }
    s
}

/// Match a model name (after prefix stripping) to a known provider.
fn match_known_provider(m: &str) -> Option<String> {
    // Anthropic
    if m.starts_with("claude") { return Some("Anthropic".to_string()); }
    // OpenAI
    if m.starts_with("gpt") || m.starts_with("o3") || m.starts_with("o4") || m.starts_with("o1")
        || m.starts_with("chatgpt") || m.starts_with("codex") || m.starts_with("dall-e")
        || m.starts_with("tts") || m.starts_with("whisper") {
        return Some("OpenAI".to_string());
    }
    // Google Gemini
    if m.starts_with("gemini") { return Some("Google Gemini".to_string()); }
    // DeepSeek
    if m.starts_with("deepseek") { return Some("DeepSeek".to_string()); }
    // Moonshot (Kimi)
    if m.starts_with("kimi") || m.starts_with("moonshot") { return Some("Moonshot".to_string()); }
    // Zhipu (GLM)
    if m.starts_with("glm") { return Some("Zhipu".to_string()); }
    // Mistral
    if m.starts_with("mistral") || m.starts_with("codestral") || m.starts_with("pixtral") || m.starts_with("ministral") {
        return Some("Mistral".to_string());
    }
    // Meta (Llama)
    if m.starts_with("llama") || m.starts_with("meta-llama") { return Some("Meta".to_string()); }
    // Qwen (Alibaba)
    if m.starts_with("qwen") { return Some("Qwen".to_string()); }
    // xAI (Grok)
    if m.starts_with("grok") { return Some("xAI".to_string()); }
    // Cohere
    if m.starts_with("command") || m.starts_with("cohere") { return Some("Cohere".to_string()); }
    // Yi (01.AI)
    if m.starts_with("yi-") { return Some("Yi".to_string()); }
    // Baichuan
    if m.starts_with("baichuan") { return Some("Baichuan".to_string()); }
    // ByteDance (Doubao)
    if m.starts_with("doubao") || m.starts_with("bytedance") { return Some("ByteDance".to_string()); }
    // SenseTime
    if m.starts_with("sensechat") || m.starts_with("sensetime") { return Some("SenseTime".to_string()); }
    // Perplexity
    if m.starts_with("perplexity") || m.starts_with("pplx") { return Some("Perplexity".to_string()); }
    // MiniMax
    if m.starts_with("minimax") { return Some("MiniMax".to_string()); }
    // Azure OpenAI
    if m.starts_with("azure") { return Some("Azure OpenAI".to_string()); }
    // GitHub Copilot
    if m.starts_with("github") || m.starts_with("copilot") { return Some("GitHub Copilot".to_string()); }
    // Ollama
    if m.starts_with("ollama") { return Some("Ollama".to_string()); }
    // Cloudflare
    if m.starts_with("cloudflare") || m.starts_with("cf-") { return Some("Cloudflare".to_string()); }
    // AiHubMix
    if m.starts_with("aihubmix") { return Some("AiHubMix".to_string()); }
    // OpenRouter (bare prefix, not already stripped)
    if m.starts_with("openrouter") { return Some("OpenRouter".to_string()); }
    // Together
    if m.starts_with("together") { return Some("Together".to_string()); }
    // Groq
    if m.starts_with("groq") { return Some("Groq".to_string()); }

    // Fallback: use first segment before '-' as provider name
    if let Some(pos) = m.find('-') {
        let provider = &m[..pos];
        if !provider.is_empty() && provider != "unknown" {
            return Some(provider.to_string());
        }
    }

    // Single-word model name with no dash — return None to filter out garbage
    None
}

pub(crate) fn model_matches_provider(model: &str, provider: &str, custom_providers: &[CustomProviderDef]) -> bool {
    model_to_provider(model, custom_providers)
        .map(|p| p.eq_ignore_ascii_case(provider))
        .unwrap_or(false)
}

pub(crate) fn parse_time_filter(s: &str) -> TimeFilter {
    match s {
        "today" => TimeFilter::Today,
        "week" => TimeFilter::Week,
        "month" => TimeFilter::Month,
        "all" => TimeFilter::All,
        other => {
            if let Some(days_str) = other.strip_prefix("days_") {
                if let Ok(days) = days_str.parse::<u32>() {
                    return TimeFilter::Days(days);
                }
            }
            TimeFilter::All
        }
    }
}

fn get_claude_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    let claude_dir = home.join(".claude");
    if !claude_dir.exists() {
        return Err(".claude directory not found".to_string());
    }
    Ok(claude_dir)
}

fn get_projects_dir() -> Result<PathBuf, String> {
    let claude_dir = get_claude_dir()?;
    let projects_dir = claude_dir.join("projects");
    if !projects_dir.exists() {
        return Err("projects directory not found".to_string());
    }
    Ok(projects_dir)
}

fn find_project_display_name(project_dir: &PathBuf) -> String {
    let internal_name = project_dir
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("unknown");

    let entries = match fs::read_dir(project_dir) {
        Ok(entries) => entries,
        Err(_) => return internal_name.trim_start_matches('-').to_string(),
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("jsonl") {
            continue;
        }

        let file = match fs::File::open(&path) {
            Ok(file) => file,
            Err(_) => continue,
        };

        let reader = BufReader::new(file);
        for line in reader.lines().take(20).flatten() {
            let value: serde_json::Value = match serde_json::from_str(&line) {
                Ok(value) => value,
                Err(_) => continue,
            };

            let cwd = match value.get("cwd").and_then(|cwd| cwd.as_str()) {
                Some(cwd) => PathBuf::from(cwd),
                None => continue,
            };

            let root = cwd
                .ancestors()
                .find(|ancestor| {
                    ancestor.join(".git").exists()
                        || ancestor.join("package.json").exists()
                        || ancestor.join("Cargo.toml").exists()
                        || ancestor.join("pnpm-lock.yaml").exists()
                })
                .unwrap_or(cwd.as_path());

            if let Some(name) = root.file_name().and_then(|name| name.to_str()) {
                if !name.is_empty() {
                    return name.to_string();
                }
            }
        }
    }

    internal_name.trim_start_matches('-').to_string()
}

pub(crate) fn filter_by_time(time_filter: &TimeFilter, file_path: &PathBuf) -> bool {
    let metadata = match fs::metadata(file_path) {
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
        TimeFilter::Week => {
            let week_ago = now - Duration::days(7);
            datetime >= week_ago
        }
        TimeFilter::Month => {
            let month_ago = now - Duration::days(30);
            datetime >= month_ago
        }
        TimeFilter::Days(d) => {
            let cutoff = now - Duration::days(*d as i64);
            datetime >= cutoff
        }
        TimeFilter::All => true,
    }
}

/// Unified file-level filter: use structured query_range if available, else legacy time_filter
fn should_include_file(path: &PathBuf, filter: &TimeFilter, query_range: &Option<QueryTimeRange>) -> bool {
    match query_range {
        Some(qr) => time_ranges::filter_by_query_range(qr, path),
        None => filter_by_time(filter, path),
    }
}

fn has_any_activity(project_dir: &PathBuf) -> bool {
    let entries = match fs::read_dir(project_dir) {
        Ok(entries) => entries,
        Err(_) => return false,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("jsonl") {
            continue;
        }
        if let Ok(meta) = fs::metadata(&path) {
            if meta.len() > 100 {
                return true;
            }
        }
    }
    false
}

fn build_project_name_map() -> Result<HashMap<String, Vec<PathBuf>>, String> {
    let projects_dir = get_projects_dir()?;
    let mut map: HashMap<String, Vec<PathBuf>> = HashMap::new();

    for entry in
        fs::read_dir(&projects_dir).map_err(|e| format!("Failed to read projects dir: {}", e))?
    {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();

        if path.is_dir() {
            let display_name = find_project_display_name(&path);
            if display_name.starts_with('.') {
                continue;
            }
            map.entry(display_name).or_default().push(path);
        }
    }

    Ok(map)
}

#[tauri::command]
pub fn get_projects(
    enabled_sources: Option<SourceConfig>,
) -> Result<Vec<ProjectInfo>, String> {
    let config = enabled_sources.unwrap_or_default();
    let name_map = build_project_name_map()?;
    let mut projects_map: HashMap<String, ProjectInfo> = HashMap::new();

    // Claude Code projects
    if config.claude_code {
        for (name, dirs) in &name_map {
            let active = dirs.iter().any(|dir| has_any_activity(dir));
            if !active { continue; }
            projects_map.entry(name.clone()).or_insert_with(|| ProjectInfo {
                name: name.clone(),
                path: name.clone(),
            });
        }
    }

    // Other sources
    let other_sources: Vec<(bool, fn() -> Vec<(String, String)>)> = vec![
        (config.codex, sources::codex::discover_projects),
        (config.gemini, sources::gemini::discover_projects),
        (config.opencode, sources::opencode::discover_projects),
        (config.openclaw, sources::openclaw::discover_projects),
    ];

    for (enabled, discover_fn) in other_sources {
        if enabled {
            for (name, path) in discover_fn() {
                projects_map.entry(name.clone()).or_insert_with(|| ProjectInfo { name, path });
            }
        }
    }

    let mut projects: Vec<ProjectInfo> = projects_map.into_values().collect();
    projects.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(projects)
}

#[tauri::command]
pub fn get_statistics(
    project: Option<String>,
    time_filter: String,
    time_range: Option<QueryTimeRange>,
    provider_filter: Option<String>,
    custom_providers: Option<Vec<CustomProviderDef>>,
    enabled_sources: Option<SourceConfig>,
) -> Result<Statistics, String> {
    let cps = custom_providers.unwrap_or_default();
    let config = enabled_sources.unwrap_or_default();
    get_statistics_internal(project, time_filter, time_range, provider_filter, &cps, &config)
}

pub fn get_statistics_internal(
    project: Option<String>,
    time_filter: String,
    time_range: Option<QueryTimeRange>,
    provider_filter: Option<String>,
    custom_providers: &[CustomProviderDef],
    config: &SourceConfig,
) -> Result<Statistics, String> {
    let filter = match time_range {
        Some(ref qr) => time_ranges::query_time_range_to_filter(qr),
        None => parse_time_filter(time_filter.as_str()),
    };

    let mut all_stats = ProjectStats::default();

    // Claude Code stats
    if config.claude_code {
        if let Ok(name_map) = build_project_name_map() {
            if let Some(ref project_name) = project {
                if let Some(dirs) = name_map.get(project_name) {
                    for dir in dirs {
                        if let Ok(stats) = collect_project_stats(dir, &filter, &time_range, &provider_filter, custom_providers) {
                            all_stats.merge(stats);
                        }
                    }
                }
            } else {
                for dirs in name_map.values() {
                    for dir in dirs {
                        if let Ok(stats) = collect_project_stats(dir, &filter, &time_range, &provider_filter, custom_providers) {
                            all_stats.merge(stats);
                        }
                    }
                }
            }
        }
    }

    // Other sources
    if config.codex {
        all_stats.merge(sources::codex::collect_stats(project.as_deref(), &filter, &provider_filter, custom_providers));
    }
    if config.gemini {
        all_stats.merge(sources::gemini::collect_stats(project.as_deref(), &filter, &provider_filter, custom_providers));
    }
    if config.opencode {
        all_stats.merge(sources::opencode::collect_stats(project.as_deref(), &filter, &provider_filter, custom_providers));
    }
    if config.openclaw {
        all_stats.merge(sources::openclaw::collect_stats(project.as_deref(), &filter, &provider_filter, custom_providers));
    }

    Ok(all_stats.to_statistics())
}

fn collect_project_stats(
    project_path: &PathBuf,
    time_filter: &TimeFilter,
    query_range: &Option<QueryTimeRange>,
    provider_filter: &Option<String>,
    custom_providers: &[CustomProviderDef],
) -> Result<ProjectStats, String> {
    let mut stats = ProjectStats::default();

    let entries = fs::read_dir(project_path).map_err(|e| format!("Failed to read project dir: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();

        if !should_include_file(&path, time_filter, query_range) {
            continue;
        }

        if let Some(ext) = path.extension() {
            if ext == "jsonl" {
                match parse_session_file(&path, time_filter) {
                    Ok(session_stats) if session_stats.has_activity => {
                        if let Some(ref provider) = provider_filter {
                            let matches = session_stats
                                .tokens
                                .by_model
                                .keys()
                                .any(|m| model_matches_provider(m, provider, custom_providers));
                            if !matches {
                                continue;
                            }
                        }
                        stats.merge_session(session_stats);
                    }
                    Ok(_) => {}
                    Err(e) => { eprintln!("Error parsing {:?}: {}", path, e); }
                }
            }
        }
    }

    Ok(stats)
}

#[tauri::command]
pub fn get_sessions(
    project: Option<String>,
    time_filter: String,
    time_range: Option<QueryTimeRange>,
    provider_filter: Option<String>,
    custom_providers: Option<Vec<CustomProviderDef>>,
    enabled_sources: Option<SourceConfig>,
) -> Result<Vec<SessionInfo>, String> {
    let filter = match time_range {
        Some(ref qr) => time_ranges::query_time_range_to_filter(qr),
        None => parse_time_filter(time_filter.as_str()),
    };
    let cps = custom_providers.unwrap_or_default();
    let config = enabled_sources.unwrap_or_default();

    let mut sessions: Vec<SessionInfo> = Vec::new();

    // Claude Code sessions
    if config.claude_code {
        if let Ok(name_map) = build_project_name_map() {
            let target_dirs: Vec<(String, &Vec<PathBuf>)> = if let Some(ref project_name) = project {
                match name_map.get(project_name) {
                    Some(dirs) => vec![(project_name.clone(), dirs)],
                    None => vec![],
                }
            } else {
                name_map.iter().map(|(k, v)| (k.clone(), v)).collect()
            };

            for (project_name, dirs) in target_dirs {
                for dir in dirs {
                    let entries = match fs::read_dir(dir) {
                        Ok(e) => e,
                        Err(_) => continue,
                    };

                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.extension().and_then(|ext| ext.to_str()) != Some("jsonl") {
                            continue;
                        }
                        if !should_include_file(&path, &filter, &time_range) {
                            continue;
                        }

                        let session_stats = match parse_session_file(&path, &filter) {
                            Ok(s) if s.has_activity => s,
                            _ => continue,
                        };

                        if let Some(ref provider) = provider_filter {
                            let matches = session_stats.tokens.by_model.keys()
                                .any(|m| model_matches_provider(m, provider, &cps));
                            if !matches { continue; }
                        }

                        let total_tokens = session_stats.tokens.input
                            + session_stats.tokens.output
                            + session_stats.tokens.cache_read
                            + session_stats.tokens.cache_creation;

                        sessions.push(SessionInfo {
                            session_id: session_stats.session_id.unwrap_or_else(|| "unknown".to_string()),
                            project_name: project_name.clone(),
                            timestamp: session_stats.first_timestamp.unwrap_or_else(|| "".to_string()),
                            duration_ms: session_stats.duration_ms,
                            duration_formatted: format_duration(session_stats.duration_ms),
                            total_tokens,
                            instructions: session_stats.instructions,
                            model: session_stats.primary_model.unwrap_or_else(|| "unknown".to_string()),
                            git_branch: session_stats.git_branch.unwrap_or_else(|| "".to_string()),
                            cost_usd: session_stats.cost_usd,
                            source: "claude_code".to_string(),
                        });
                    }
                }
            }
        }
    }

    // Other sources
    if config.codex {
        sessions.extend(sources::codex::collect_sessions(project.as_deref(), &filter, &provider_filter, &cps));
    }
    if config.gemini {
        sessions.extend(sources::gemini::collect_sessions(project.as_deref(), &filter, &provider_filter, &cps));
    }
    if config.opencode {
        sessions.extend(sources::opencode::collect_sessions(project.as_deref(), &filter, &provider_filter, &cps));
    }
    if config.openclaw {
        sessions.extend(sources::openclaw::collect_sessions(project.as_deref(), &filter, &provider_filter, &cps));
    }

    sessions.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    Ok(sessions)
}

#[tauri::command]
pub fn get_instructions(
    project: Option<String>,
    time_filter: String,
    time_range: Option<QueryTimeRange>,
    provider_filter: Option<String>,
    custom_providers: Option<Vec<CustomProviderDef>>,
    enabled_sources: Option<SourceConfig>,
) -> Result<Vec<InstructionInfo>, String> {
    let filter = match time_range {
        Some(ref qr) => time_ranges::query_time_range_to_filter(qr),
        None => parse_time_filter(time_filter.as_str()),
    };
    let cps = custom_providers.unwrap_or_default();

    let name_map = build_project_name_map()?;
    let mut instructions: Vec<InstructionInfo> = Vec::new();

    let target_dirs: Vec<(String, &Vec<PathBuf>)> = if let Some(ref project_name) = project {
        match name_map.get(project_name) {
            Some(dirs) => vec![(project_name.clone(), dirs)],
            None => return Ok(vec![]),
        }
    } else {
        name_map.iter().map(|(k, v)| (k.clone(), v)).collect()
    };

    for (project_name, dirs) in target_dirs {
        for dir in dirs {
            let entries = match fs::read_dir(dir) {
                Ok(e) => e,
                Err(_) => continue,
            };

            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|ext| ext.to_str()) != Some("jsonl") {
                    continue;
                }
                if !should_include_file(&path, &filter, &time_range) {
                    continue;
                }

                if let Some(ref provider) = provider_filter {
                    let session_stats = match parse_session_file(&path, &filter) {
                        Ok(s) => s,
                        Err(_) => continue,
                    };
                    let matches = session_stats
                        .tokens
                        .by_model
                        .keys()
                        .any(|m| model_matches_provider(m, provider, &cps));
                    if !matches {
                        continue;
                    }
                }

                let session_id = path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("unknown")
                    .to_string();

                let items = match extract_instructions(&path, &filter) {
                    Ok(items) => items,
                    Err(_) => continue,
                };

                for (timestamp, content) in items {
                    instructions.push(InstructionInfo {
                        timestamp,
                        project_name: project_name.clone(),
                        session_id: session_id.clone(),
                        content,
                    });
                }
            }
        }
    }

    instructions.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    Ok(instructions)
}

#[tauri::command]
pub fn update_tray_stats(app: tauri::AppHandle) {
    crate::tray::update_tray(&app);
}

#[tauri::command]
pub fn get_available_providers(
    custom_providers: Option<Vec<CustomProviderDef>>,
    enabled_sources: Option<SourceConfig>,
) -> Result<Vec<String>, String> {
    let cps = custom_providers.unwrap_or_default();
    let config = enabled_sources.unwrap_or_default();
    let mut providers: HashSet<String> = HashSet::new();

    // Claude Code providers
    if config.claude_code {
        if let Ok(name_map) = build_project_name_map() {
            for dirs in name_map.values() {
                for dir in dirs {
                    let entries = match fs::read_dir(dir) {
                        Ok(e) => e,
                        Err(_) => continue,
                    };
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.extension().and_then(|ext| ext.to_str()) != Some("jsonl") { continue; }
                        if let Ok(session_stats) = parse_session_file(&path, &TimeFilter::All) {
                            if session_stats.has_activity {
                                for model_key in session_stats.tokens.by_model.keys() {
                                    if let Some(provider) = model_to_provider(model_key, &cps) {
                                        providers.insert(provider);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Other sources: get providers from their sessions
    let other_sessions_fns: Vec<(bool, fn(Option<&str>, &TimeFilter, &Option<String>, &[CustomProviderDef]) -> Vec<SessionInfo>)> = vec![
        (config.codex, sources::codex::collect_sessions),
        (config.gemini, sources::gemini::collect_sessions),
        (config.opencode, sources::opencode::collect_sessions),
        (config.openclaw, sources::openclaw::collect_sessions),
    ];

    for (enabled, collect_fn) in other_sessions_fns {
        if enabled {
            for session in collect_fn(None, &TimeFilter::All, &None, &cps) {
                if let Some(provider) = model_to_provider(&session.model, &cps) {
                    providers.insert(provider);
                }
            }
        }
    }

    let mut result: Vec<String> = providers.into_iter().collect();
    result.sort();
    Ok(result)
}

#[tauri::command]
pub fn detect_sources() -> Vec<(String, bool)> {
    crate::sources::detect_installed_sources()
}
