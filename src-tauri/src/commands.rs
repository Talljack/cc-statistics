use crate::aggregation;
use crate::models::*;
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
        "databricks/", "amazon/", "ai21/", "zhipu/", "zai/", "moonshot/", "baichuan/",
        "bytedance/", "minimax/", "sensetime/", "cloudflare/", "aihubmix/",
        "fireworks/", "cerebras/", "sambanova/", "stepfun/", "baidu/", "tencent/",
        "iflytek/", "internlm/", "reka/", "nousresearch/",
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
    // Z.AI (GLM)
    if m.starts_with("glm") { return Some("Z.AI".to_string()); }
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
    // Fireworks AI
    if m.starts_with("fireworks") || m.starts_with("accounts/fireworks") { return Some("Fireworks AI".to_string()); }
    // Amazon Bedrock
    if m.starts_with("bedrock") { return Some("Amazon Bedrock".to_string()); }
    // AI21 Labs
    if m.starts_with("jamba") || m.starts_with("j2-") { return Some("AI21 Labs".to_string()); }
    // Cerebras
    if m.starts_with("cerebras") { return Some("Cerebras".to_string()); }
    // SambaNova
    if m.starts_with("samba") { return Some("SambaNova".to_string()); }
    // Stepfun (阶跃星辰)
    if m.starts_with("step-") { return Some("Stepfun".to_string()); }
    // Baidu (百度文心)
    if m.starts_with("ernie") || m.starts_with("wenxin") { return Some("Baidu".to_string()); }
    // Tencent (腾讯混元)
    if m.starts_with("hunyuan") { return Some("Tencent".to_string()); }
    // iFlytek (讯飞星火)
    if m.starts_with("spark") || m.starts_with("iflytek") { return Some("iFlytek".to_string()); }
    // Shanghai AI Lab (书生·浦语)
    if m.starts_with("internlm") { return Some("InternLM".to_string()); }
    // NVIDIA
    if m.starts_with("nemotron") || m.starts_with("nvidia") { return Some("NVIDIA".to_string()); }
    // Reka
    if m.starts_with("reka") { return Some("Reka".to_string()); }
    // Nous Research
    if m.starts_with("nous") || m.starts_with("hermes") { return Some("Nous Research".to_string()); }

    // No known provider matched — return None instead of guessing from model name
    // All mainstream providers are handled above; unknown models should not
    // generate garbage provider names like "delivery", "custom", etc.
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
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn get_statistics(
    project: Option<String>,
    time_filter: String,
    time_range: Option<QueryTimeRange>,
    provider_filter: Option<String>,
    custom_providers: Option<Vec<CustomProviderDef>>,
    enabled_sources: Option<SourceConfig>,
) -> Result<Statistics, String> {
    tokio::task::spawn_blocking(move || {
        let cps = custom_providers.unwrap_or_default();
        let config = enabled_sources.unwrap_or_default();
        get_statistics_internal(project, time_filter, time_range, provider_filter, &cps, &config)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
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
    project: Option<String>,
    time_filter: String,
    time_range: Option<QueryTimeRange>,
    provider_filter: Option<String>,
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
    project: Option<String>,
    time_filter: String,
    time_range: Option<QueryTimeRange>,
    provider_filter: Option<String>,
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
    project: Option<String>,
    time_filter: String,
    time_range: Option<QueryTimeRange>,
    provider_filter: Option<String>,
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
    enabled_sources: Option<SourceConfig>,
) -> Result<AccountUsageResult, String> {
    let config = enabled_sources.unwrap_or_default();
    let mut providers = Vec::new();

    // Fetch Codex usage from real API
    if config.codex {
        match fetch_codex_usage().await {
            Ok(usage) => providers.push(usage),
            Err(e) => eprintln!("Codex usage fetch failed: {}", e),
        }
    }

    // Fetch Claude usage from real API
    if config.claude_code {
        match fetch_claude_usage().await {
            Ok(usage) => providers.push(usage),
            Err(e) => eprintln!("Claude usage fetch failed: {}", e),
        }
    }

    Ok(AccountUsageResult { providers })
}

/// Fetch Codex CLI usage from chatgpt.com/backend-api/wham/usage
async fn fetch_codex_usage() -> Result<ProviderUsage, String> {
    let home = dirs::home_dir().ok_or("No home dir")?;
    let auth_path = home.join(".codex").join("auth.json");
    let auth_data: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string(&auth_path).map_err(|e| format!("Read auth.json: {}", e))?,
    )
    .map_err(|e| format!("Parse auth.json: {}", e))?;

    let access_token = auth_data
        .pointer("/tokens/access_token")
        .and_then(|v| v.as_str())
        .ok_or("No access_token in auth.json")?;
    let account_id = auth_data
        .pointer("/tokens/account_id")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let client = reqwest::Client::new();
    let resp = client
        .get("https://chatgpt.com/backend-api/wham/usage")
        .header("Authorization", format!("Bearer {}", access_token))
        .header("ChatGPT-Account-Id", account_id)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Codex API request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Codex API returned {}", resp.status()));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Parse Codex response: {}", e))?;

    let plan_type = body
        .get("plan_type")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();
    let email = body
        .get("email")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let limit_reached = body
        .pointer("/rate_limit/limit_reached")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let session_used = body
        .pointer("/rate_limit/primary_window/used_percent")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    let session_reset = body
        .pointer("/rate_limit/primary_window/reset_after_seconds")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);

    let (weekly_used, weekly_reset) = match body.pointer("/rate_limit/secondary_window") {
        Some(w) if !w.is_null() => (
            w.get("used_percent").and_then(|v| v.as_f64()),
            w.get("reset_after_seconds")
                .and_then(|v| v.as_i64())
                .unwrap_or(0),
        ),
        _ => (None, 0),
    };

    let credits_balance = body
        .pointer("/credits/balance")
        .and_then(|v| v.as_f64().or_else(|| v.as_str().and_then(|s| s.parse().ok())));

    Ok(ProviderUsage {
        source: "codex".to_string(),
        plan_type,
        session_used_percent: session_used,
        session_reset_seconds: session_reset,
        weekly_used_percent: weekly_used,
        weekly_reset_seconds: weekly_reset,
        limit_reached,
        email,
        credits_balance,
    })
}

/// Fetch Claude Code usage from api.anthropic.com OAuth API
async fn fetch_claude_usage() -> Result<ProviderUsage, String> {
    // Try reading credentials from macOS Keychain first, then file
    let creds = read_claude_credentials()?;
    let access_token = creds
        .pointer("/claudeAiOauth/accessToken")
        .or_else(|| creds.get("accessToken"))
        .and_then(|v| v.as_str())
        .ok_or("No Claude OAuth accessToken found")?;
    let plan_type = creds
        .pointer("/claudeAiOauth/subscriptionType")
        .or_else(|| creds.get("subscriptionType"))
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();
    let rate_limit_tier = creds
        .pointer("/claudeAiOauth/rateLimitTier")
        .or_else(|| creds.get("rateLimitTier"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let display_plan = if !rate_limit_tier.is_empty() {
        // e.g. "default_claude_max_5x" -> "Max 5x"
        let tier = rate_limit_tier.to_lowercase();
        if tier.contains("max_20x") {
            "Max 20x".to_string()
        } else if tier.contains("max_5x") {
            "Max 5x".to_string()
        } else {
            capitalize(&plan_type)
        }
    } else {
        capitalize(&plan_type)
    };

    let client = reqwest::Client::new();
    let resp = client
        .get("https://api.anthropic.com/api/oauth/usage")
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Accept", "application/json")
        .header("anthropic-beta", "oauth-2025-04-20")
        .header("User-Agent", "claude-code/2.1.0")
        .send()
        .await
        .map_err(|e| format!("Claude API request failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Claude API returned {}: {}", status, body));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Parse Claude response: {}", e))?;

    // Response has five_hour.utilization, seven_day.utilization, etc.
    let session_used = body
        .pointer("/five_hour/utilization")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    let session_reset = parse_reset_seconds(&body, "/five_hour/resets_at");

    let weekly_used = body
        .pointer("/seven_day/utilization")
        .and_then(|v| v.as_f64());
    let weekly_reset = parse_reset_seconds(&body, "/seven_day/resets_at");

    Ok(ProviderUsage {
        source: "claude_code".to_string(),
        plan_type: display_plan,
        session_used_percent: session_used,
        session_reset_seconds: session_reset,
        weekly_used_percent: weekly_used,
        weekly_reset_seconds: weekly_reset,
        limit_reached: session_used >= 100.0 || weekly_used.unwrap_or(0.0) >= 100.0,
        email: None,
        credits_balance: None,
    })
}

fn capitalize(s: &str) -> String {
    let mut c = s.chars();
    match c.next() {
        None => String::new(),
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
    }
}

fn parse_reset_seconds(body: &serde_json::Value, pointer: &str) -> i64 {
    body.pointer(pointer)
        .and_then(|v| v.as_str())
        .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
        .map(|dt| {
            let now = chrono::Utc::now();
            (dt.with_timezone(&chrono::Utc) - now)
                .num_seconds()
                .max(0)
        })
        .unwrap_or(0)
}

/// Read Claude OAuth credentials from macOS Keychain or file
fn read_claude_credentials() -> Result<serde_json::Value, String> {
    // Try macOS Keychain first
    #[cfg(target_os = "macos")]
    {
        let output = std::process::Command::new("security")
            .args(["find-generic-password", "-s", "Claude Code-credentials", "-w"])
            .output();
        if let Ok(out) = output {
            if out.status.success() {
                let json_str = String::from_utf8_lossy(&out.stdout);
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(json_str.trim()) {
                    return Ok(v);
                }
            }
        }
    }

    // Fall back to file
    let home = dirs::home_dir().ok_or("No home dir")?;
    for path in [
        home.join(".claude").join(".credentials.json"),
        home.join(".claude").join("credentials.json"),
    ] {
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) {
                return Ok(v);
            }
        }
    }

    Err("No Claude credentials found".to_string())
}

fn default_preset_models() -> Vec<String> {
    vec![
        "claude-opus-4-6", "claude-sonnet-4-6", "gpt-5.4", "o3",
        "gemini-3-pro-preview", "deepseek-r1", "grok-4", "glm-5",
        "kimi-k2.5", "minimax-m2.7", "llama-4-maverick",
    ].into_iter().map(String::from).collect()
}
