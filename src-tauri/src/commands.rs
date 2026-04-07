use crate::aggregation;
use crate::export::{format_csv, format_json, format_markdown, format_xlsx, ExportRow};
use crate::models::*;
use crate::pricing_providers;
use crate::session_reader::{
    parse_session_messages, read_codex_session_file, read_gemini_session_file,
    read_openclaw_session_file, read_opencode_session_file, read_session_file, SessionMessage,
};
use crate::sources;
use crate::time_ranges;
use chrono::{DateTime, Duration, Local, TimeZone};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomProviderDef {
    pub name: String,
    pub keyword: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayDisplayStats {
    pub cost_usd: f64,
    pub sessions: usize,
    pub instructions: u64,
    pub total_tokens: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub alert_level: Option<String>,
}

/// Extract provider name from a model string.
/// Handles various formats: bare model names, slash-prefixed (openrouter/x-ai/grok-4),
/// antigravity proxy models, and custom provider keywords.
pub(crate) fn model_to_provider(
    model: &str,
    custom_providers: &[CustomProviderDef],
) -> Option<String> {
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
        if inner.starts_with("gemini") {
            return Some("Google Gemini".to_string());
        }
        if inner.starts_with("claude") {
            return Some("Anthropic".to_string());
        }
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
        "openrouter/",
        "together/",
        "groq/",
        "openrouter-",
        "together-",
        "groq-",
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
        "x-ai/",
        "anthropic/",
        "google/",
        "meta-llama/",
        "meta/",
        "mistralai/",
        "cohere/",
        "deepseek/",
        "qwen/",
        "microsoft/",
        "nvidia/",
        "01-ai/",
        "databricks/",
        "amazon/",
        "ai21/",
        "zhipu/",
        "zai/",
        "moonshot/",
        "baichuan/",
        "bytedance/",
        "minimax/",
        "sensetime/",
        "cloudflare/",
        "aihubmix/",
        "fireworks/",
        "cerebras/",
        "sambanova/",
        "stepfun/",
        "baidu/",
        "tencent/",
        "iflytek/",
        "internlm/",
        "reka/",
        "nousresearch/",
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
    if m.starts_with("claude") {
        return Some("Anthropic".to_string());
    }
    // OpenAI
    if m.starts_with("gpt")
        || m.starts_with("o3")
        || m.starts_with("o4")
        || m.starts_with("o1")
        || m.starts_with("chatgpt")
        || m.starts_with("codex")
        || m.starts_with("dall-e")
        || m.starts_with("tts")
        || m.starts_with("whisper")
    {
        return Some("OpenAI".to_string());
    }
    // Google Gemini
    if m.starts_with("gemini") {
        return Some("Google Gemini".to_string());
    }
    // DeepSeek
    if m.starts_with("deepseek") {
        return Some("DeepSeek".to_string());
    }
    // Moonshot (Kimi)
    if m.starts_with("kimi") || m.starts_with("moonshot") {
        return Some("Moonshot".to_string());
    }
    // Z.AI (GLM)
    if m.starts_with("glm") {
        return Some("Z.AI".to_string());
    }
    // Mistral
    if m.starts_with("mistral")
        || m.starts_with("codestral")
        || m.starts_with("pixtral")
        || m.starts_with("ministral")
    {
        return Some("Mistral".to_string());
    }
    // Meta (Llama)
    if m.starts_with("llama") || m.starts_with("meta-llama") {
        return Some("Meta".to_string());
    }
    // Qwen (Alibaba)
    if m.starts_with("qwen") {
        return Some("Qwen".to_string());
    }
    // xAI (Grok)
    if m.starts_with("grok") {
        return Some("xAI".to_string());
    }
    // Cohere
    if m.starts_with("command") || m.starts_with("cohere") {
        return Some("Cohere".to_string());
    }
    // Yi (01.AI)
    if m.starts_with("yi-") {
        return Some("Yi".to_string());
    }
    // Baichuan
    if m.starts_with("baichuan") {
        return Some("Baichuan".to_string());
    }
    // ByteDance (Doubao)
    if m.starts_with("doubao") || m.starts_with("bytedance") {
        return Some("ByteDance".to_string());
    }
    // SenseTime
    if m.starts_with("sensechat") || m.starts_with("sensetime") {
        return Some("SenseTime".to_string());
    }
    // Perplexity
    if m.starts_with("perplexity") || m.starts_with("pplx") {
        return Some("Perplexity".to_string());
    }
    // MiniMax
    if m.starts_with("minimax") {
        return Some("MiniMax".to_string());
    }
    // Azure OpenAI
    if m.starts_with("azure") {
        return Some("Azure OpenAI".to_string());
    }
    // GitHub Copilot
    if m.starts_with("github") || m.starts_with("copilot") {
        return Some("GitHub Copilot".to_string());
    }
    // Ollama
    if m.starts_with("ollama") {
        return Some("Ollama".to_string());
    }
    // Cloudflare
    if m.starts_with("cloudflare") || m.starts_with("cf-") {
        return Some("Cloudflare".to_string());
    }
    // AiHubMix
    if m.starts_with("aihubmix") {
        return Some("AiHubMix".to_string());
    }
    // OpenRouter (bare prefix, not already stripped)
    if m.starts_with("openrouter") {
        return Some("OpenRouter".to_string());
    }
    // Together
    if m.starts_with("together") {
        return Some("Together".to_string());
    }
    // Groq
    if m.starts_with("groq") {
        return Some("Groq".to_string());
    }
    // Fireworks AI
    if m.starts_with("fireworks") || m.starts_with("accounts/fireworks") {
        return Some("Fireworks AI".to_string());
    }
    // Amazon Bedrock
    if m.starts_with("bedrock") {
        return Some("Amazon Bedrock".to_string());
    }
    // AI21 Labs
    if m.starts_with("jamba") || m.starts_with("j2-") {
        return Some("AI21 Labs".to_string());
    }
    // Cerebras
    if m.starts_with("cerebras") {
        return Some("Cerebras".to_string());
    }
    // SambaNova
    if m.starts_with("samba") {
        return Some("SambaNova".to_string());
    }
    // Stepfun (阶跃星辰)
    if m.starts_with("step-") {
        return Some("Stepfun".to_string());
    }
    // Baidu (百度文心)
    if m.starts_with("ernie") || m.starts_with("wenxin") {
        return Some("Baidu".to_string());
    }
    // Tencent (腾讯混元)
    if m.starts_with("hunyuan") {
        return Some("Tencent".to_string());
    }
    // iFlytek (讯飞星火)
    if m.starts_with("spark") || m.starts_with("iflytek") {
        return Some("iFlytek".to_string());
    }
    // Shanghai AI Lab (书生·浦语)
    if m.starts_with("internlm") {
        return Some("InternLM".to_string());
    }
    // NVIDIA
    if m.starts_with("nemotron") || m.starts_with("nvidia") {
        return Some("NVIDIA".to_string());
    }
    // Reka
    if m.starts_with("reka") {
        return Some("Reka".to_string());
    }
    // Nous Research
    if m.starts_with("nous") || m.starts_with("hermes") {
        return Some("Nous Research".to_string());
    }

    // No known provider matched — return None instead of guessing from model name
    // All mainstream providers are handled above; unknown models should not
    // generate garbage provider names like "delivery", "custom", etc.
    None
}

pub(crate) fn model_matches_provider(
    model: &str,
    provider: &str,
    custom_providers: &[CustomProviderDef],
) -> bool {
    model_to_provider(model, custom_providers)
        .map(|p| p.eq_ignore_ascii_case(provider))
        .unwrap_or(false)
}

pub(crate) fn normalize_filter_values(values: Option<Vec<String>>) -> Option<Vec<String>> {
    let values = values
        .unwrap_or_default()
        .into_iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();

    if values.is_empty() {
        None
    } else {
        Some(values)
    }
}

pub(crate) fn project_matches_filters(project_filters: Option<&[String]>, project_name: &str) -> bool {
    let Some(project_filters) = project_filters else {
        return true;
    };

    project_filters
        .iter()
        .any(|project| project_name.eq_ignore_ascii_case(project))
}

pub(crate) fn model_matches_provider_filters(
    model: &str,
    provider_filters: Option<&[String]>,
    custom_providers: &[CustomProviderDef],
) -> bool {
    let Some(provider_filters) = provider_filters else {
        return true;
    };

    provider_filters
        .iter()
        .any(|provider| model_matches_provider(model, provider, custom_providers))
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
pub async fn get_projects(
    enabled_sources: Option<SourceConfig>,
) -> Result<Vec<ProjectInfo>, String> {
    tokio::task::spawn_blocking(move || {
        let config = enabled_sources.unwrap_or_default();
        let name_map = build_project_name_map()?;
        let mut projects_map: HashMap<String, ProjectInfo> = HashMap::new();

        // Claude Code projects
        if config.claude_code {
            for (name, dirs) in &name_map {
                let active = dirs.iter().any(|dir| has_any_activity(dir));
                if !active {
                    continue;
                }
                projects_map
                    .entry(name.clone())
                    .or_insert_with(|| ProjectInfo {
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
                    projects_map
                        .entry(name.clone())
                        .or_insert_with(|| ProjectInfo { name, path });
                }
            }
        }

        let mut projects: Vec<ProjectInfo> = projects_map.into_values().collect();
        projects.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(projects)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn get_statistics(
    project: Option<Vec<String>>,
    time_filter: String,
    time_range: Option<QueryTimeRange>,
    provider_filter: Option<Vec<String>>,
    custom_providers: Option<Vec<CustomProviderDef>>,
    enabled_sources: Option<SourceConfig>,
) -> Result<Statistics, String> {
    tokio::task::spawn_blocking(move || {
        let cps = custom_providers.unwrap_or_default();
        let config = enabled_sources.unwrap_or_default();
        get_statistics_internal(
            project,
            time_filter,
            time_range,
            provider_filter,
            &cps,
            &config,
        )
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

pub fn get_statistics_internal(
    project: Option<Vec<String>>,
    time_filter: String,
    time_range: Option<QueryTimeRange>,
    provider_filter: Option<Vec<String>>,
    custom_providers: &[CustomProviderDef],
    config: &SourceConfig,
) -> Result<Statistics, String> {
    let filter = match time_range {
        Some(ref qr) => time_ranges::query_time_range_to_filter(qr),
        None => parse_time_filter(time_filter.as_str()),
    };
    let project = normalize_filter_values(project);
    let provider_filter = normalize_filter_values(provider_filter);
    let effective_range = time_ranges::effective_query_range(&filter, time_range.as_ref());
    let sessions =
        sources::collect_all_normalized_sessions(project.as_deref(), &effective_range, config);

    Ok(aggregation::aggregate_statistics(
        &sessions,
        &effective_range,
        &provider_filter,
        custom_providers,
    ))
}

#[tauri::command]
pub async fn get_sessions(
    project: Option<Vec<String>>,
    time_filter: String,
    time_range: Option<QueryTimeRange>,
    provider_filter: Option<Vec<String>>,
    custom_providers: Option<Vec<CustomProviderDef>>,
    enabled_sources: Option<SourceConfig>,
) -> Result<Vec<SessionInfo>, String> {
    tokio::task::spawn_blocking(move || {
        let filter = match time_range {
            Some(ref qr) => time_ranges::query_time_range_to_filter(qr),
            None => parse_time_filter(time_filter.as_str()),
        };
        let cps = custom_providers.unwrap_or_default();
        let config = enabled_sources.unwrap_or_default();
        let project = normalize_filter_values(project);
        let provider_filter = normalize_filter_values(provider_filter);
        let effective_range = time_ranges::effective_query_range(&filter, time_range.as_ref());
        let sessions =
            sources::collect_all_normalized_sessions(project.as_deref(), &effective_range, &config);

        Ok(aggregation::aggregate_sessions(
            &sessions,
            &effective_range,
            &provider_filter,
            &cps,
        ))
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn get_instructions(
    project: Option<Vec<String>>,
    time_filter: String,
    time_range: Option<QueryTimeRange>,
    provider_filter: Option<Vec<String>>,
    custom_providers: Option<Vec<CustomProviderDef>>,
    enabled_sources: Option<SourceConfig>,
) -> Result<Vec<InstructionInfo>, String> {
    tokio::task::spawn_blocking(move || {
        let filter = match time_range {
            Some(ref qr) => time_ranges::query_time_range_to_filter(qr),
            None => parse_time_filter(time_filter.as_str()),
        };
        let cps = custom_providers.unwrap_or_default();
        let config = enabled_sources.unwrap_or_default();
        let project = normalize_filter_values(project);
        let provider_filter = normalize_filter_values(provider_filter);
        let effective_range = time_ranges::effective_query_range(&filter, time_range.as_ref());
        let sessions =
            sources::collect_all_normalized_sessions(project.as_deref(), &effective_range, &config);

        Ok(aggregation::aggregate_instructions(
            &sessions,
            &effective_range,
            &provider_filter,
            &cps,
        ))
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}


#[tauri::command]
pub fn export_report(
    sessions: Vec<SessionInfo>,
    format: String,
    title: Option<String>,
) -> Result<String, String> {
    let rows: Vec<ExportRow> = sessions
        .into_iter()
        .map(|s| ExportRow {
            date: s.timestamp.split('T').next().unwrap_or(&s.timestamp).to_string(),
            project: s.project_name,
            session_id: s.session_id,
            model: s.model,
            source: s.source,
            input_tokens: s.input,
            output_tokens: s.output,
            cache_read_tokens: s.cache_read,
            cache_creation_tokens: s.cache_creation,
            total_tokens: s.total_tokens,
            cost_usd: s.cost_usd,
            duration_ms: s.duration_ms,
            instructions: s.instructions,
            git_branch: s.git_branch,
        })
        .collect();

    let title = title.unwrap_or_else(|| "CC Statistics Report".to_string());

    match format.as_str() {
        "csv" => Ok(format_csv(&rows)),
        "json" => Ok(format_json(&rows)),
        "markdown" | "md" => Ok(format_markdown(&rows, &title)),
        _ => Err(format!("Unknown export format: {}", format)),
    }
}

#[tauri::command]
pub fn export_report_xlsx(
    sessions: Vec<SessionInfo>,
    title: Option<String>,
) -> Result<Vec<u8>, String> {
    let rows: Vec<ExportRow> = sessions
        .into_iter()
        .map(|s| ExportRow {
            date: s.timestamp.split('T').next().unwrap_or(&s.timestamp).to_string(),
            project: s.project_name,
            session_id: s.session_id,
            model: s.model,
            source: s.source,
            input_tokens: s.input,
            output_tokens: s.output,
            cache_read_tokens: s.cache_read,
            cache_creation_tokens: s.cache_creation,
            total_tokens: s.total_tokens,
            cost_usd: s.cost_usd,
            duration_ms: s.duration_ms,
            instructions: s.instructions,
            git_branch: s.git_branch,
        })
        .collect();

    let title = title.unwrap_or_else(|| "CC Statistics Report".to_string());

    format_xlsx(&rows, &title).map_err(|e| format!("Failed to create Excel file: {}", e))
}

#[tauri::command]
pub async fn get_session_messages(
    session_id: String,
    source: String,
) -> Result<Vec<SessionMessage>, String> {
    tokio::task::spawn_blocking(move || {
        match source.as_str() {
            "claude_code" => {
                let jsonl = read_session_file(&session_id)?;
                Ok(parse_session_messages(&jsonl))
            }
            "openclaw" => {
                let jsonl = read_openclaw_session_file(&session_id)?;
                Ok(parse_session_messages(&jsonl))
            }
            "codex" => read_codex_session_file(&session_id),
            "gemini" => read_gemini_session_file(&session_id),
            "opencode" => read_opencode_session_file(&session_id),
            _ => Ok(Vec::new()),
        }
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub fn update_tray_stats(app: tauri::AppHandle, stats: Option<TrayDisplayStats>) {
    crate::tray::update_tray(&app, stats);
}

#[tauri::command]
pub async fn get_available_providers(
    custom_providers: Option<Vec<CustomProviderDef>>,
    enabled_sources: Option<SourceConfig>,
) -> Result<Vec<String>, String> {
    tokio::task::spawn_blocking(move || {
        let cps = custom_providers.unwrap_or_default();
        let config = enabled_sources.unwrap_or_default();
        let all_range = QueryTimeRange::BuiltIn {
            key: BuiltInTimeRangeKey::All,
        };
        let sessions = sources::collect_all_normalized_sessions(None, &all_range, &config);
        Ok(aggregation::aggregate_available_providers(&sessions, &cps))
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn get_code_changes_detail(
    project: Option<Vec<String>>,
    time_filter: String,
    time_range: Option<QueryTimeRange>,
    provider_filter: Option<Vec<String>>,
    custom_providers: Option<Vec<CustomProviderDef>>,
    enabled_sources: Option<SourceConfig>,
) -> Result<Vec<FileChange>, String> {
    tokio::task::spawn_blocking(move || {
        let filter = match time_range {
            Some(ref qr) => time_ranges::query_time_range_to_filter(qr),
            None => parse_time_filter(time_filter.as_str()),
        };
        let cps = custom_providers.unwrap_or_default();
        let config = enabled_sources.unwrap_or_default();
        let project = normalize_filter_values(project);
        let provider_filter = normalize_filter_values(provider_filter);
        let effective_range = time_ranges::effective_query_range(&filter, time_range.as_ref());
        let sessions =
            sources::collect_all_normalized_sessions(project.as_deref(), &effective_range, &config);

        Ok(aggregation::aggregate_code_changes_detail(
            &sessions,
            &effective_range,
            &provider_filter,
            &cps,
        ))
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub fn detect_sources() -> Vec<(String, bool)> {
    crate::sources::detect_installed_sources()
}

/// Read preset model IDs from ~/.claude/cc-statistics-models.json
/// If file doesn't exist, create it with defaults and return them.
#[tauri::command]
pub fn get_preset_models() -> Vec<String> {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return default_preset_models(),
    };
    let config_path = home.join(".claude").join("cc-statistics-models.json");

    if config_path.exists() {
        if let Ok(content) = fs::read_to_string(&config_path) {
            if let Ok(models) = serde_json::from_str::<Vec<String>>(&content) {
                if !models.is_empty() {
                    return models;
                }
            }
        }
    }

    let defaults = default_preset_models();
    if let Ok(json) = serde_json::to_string_pretty(&defaults) {
        let _ = fs::write(&config_path, json);
    }
    defaults
}

#[tauri::command]
pub async fn get_account_usage(
    app: tauri::AppHandle,
    _enabled_sources: Option<SourceConfig>,
) -> Result<AccountUsageResult, String> {
    let providers = crate::account_providers::fetch_all_streaming(&app).await;
    Ok(AccountUsageResult { providers })
}

#[tauri::command]
pub async fn get_pricing_catalog(
    force_refresh: Option<bool>,
) -> Result<PricingCatalogResult, String> {
    get_pricing_catalog_with_fetcher(force_refresh, pricing_providers::fetch_openrouter_catalog)
        .await
}

#[tauri::command]
pub async fn refresh_pricing_catalog() -> Result<PricingCatalogResult, String> {
    refresh_pricing_catalog_with_fetcher(pricing_providers::fetch_openrouter_catalog).await
}

pub async fn get_pricing_catalog_with_fetcher<F, Fut>(
    force_refresh: Option<bool>,
    fetcher: F,
) -> Result<PricingCatalogResult, String>
where
    F: Fn() -> Fut,
    Fut: std::future::Future<Output = Result<Vec<ModelPriceEntry>, String>>,
{
    pricing_providers::load_or_refresh_catalog_with_fetcher(force_refresh.unwrap_or(false), fetcher)
        .await
}

pub async fn refresh_pricing_catalog_with_fetcher<F, Fut>(
    fetcher: F,
) -> Result<PricingCatalogResult, String>
where
    F: Fn() -> Fut,
    Fut: std::future::Future<Output = Result<Vec<ModelPriceEntry>, String>>,
{
    get_pricing_catalog_with_fetcher(Some(true), fetcher).await
}

fn default_preset_models() -> Vec<String> {
    vec![
        "claude-opus-4-6",
        "claude-sonnet-4-6",
        "gpt-5.4",
        "o3",
        "gemini-3-pro-preview",
        "deepseek-r1",
        "grok-4",
        "glm-5",
        "kimi-k2.5",
        "minimax-m2.7",
        "llama-4-maverick",
    ]
    .into_iter()
    .map(String::from)
    .collect()
}
