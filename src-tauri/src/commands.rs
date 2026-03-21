use crate::models::*;
use crate::parser::{extract_instructions, format_duration, parse_session_file, ProjectStats};
use chrono::{DateTime, Duration, Local, TimeZone};
use std::collections::HashMap;
use std::collections::HashSet;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;

/// Extract provider name from a model string.
/// Known mappings for common providers, otherwise take the first segment before '-'.
/// Returns None for synthetic/internal models (e.g. "<synthetic>").
fn model_to_provider(model: &str) -> Option<String> {
    let m = model.to_lowercase();

    // Skip synthetic/internal models
    if m.contains('<') || m.contains('>') || m.is_empty() {
        return None;
    }

    // Known provider mappings
    if m.starts_with("claude") {
        return Some("Claude".to_string());
    }
    if m.starts_with("gpt") || m.starts_with("o3") || m.starts_with("o4") || m.starts_with("o1") {
        return Some("OpenAI".to_string());
    }
    if m.starts_with("gemini") {
        return Some("Google".to_string());
    }
    if m.starts_with("deepseek") {
        return Some("DeepSeek".to_string());
    }
    if m.starts_with("kimi") || m.starts_with("moonshot") {
        return Some("Moonshot".to_string());
    }
    if m.starts_with("glm") {
        return Some("Zhipu".to_string());
    }

    // Unknown model: use first segment before '-' as provider name, preserving original case
    if let Some(pos) = model.find('-') {
        let provider = &model[..pos];
        if !provider.is_empty() {
            return Some(provider.to_string());
        }
    }

    // No dash found — use the whole model name as provider
    Some(model.to_string())
}

/// Check if a model belongs to the given provider
fn model_matches_provider(model: &str, provider: &str) -> bool {
    model_to_provider(model)
        .map(|p| p.eq_ignore_ascii_case(provider))
        .unwrap_or(false)
}

fn parse_time_filter(s: &str) -> TimeFilter {
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

fn filter_by_time(time_filter: &TimeFilter, file_path: &PathBuf) -> bool {
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

/// Quick check: does this project directory have any non-empty JSONL files with actual records?
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
        // A file with > 100 bytes almost certainly has real records
        if let Ok(meta) = fs::metadata(&path) {
            if meta.len() > 100 {
                return true;
            }
        }
    }
    false
}

/// Build a map of display_name -> Vec<PathBuf> for all project directories
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
            // Skip hidden/dot-prefixed project names
            if display_name.starts_with('.') {
                continue;
            }
            map.entry(display_name).or_default().push(path);
        }
    }

    Ok(map)
}

#[tauri::command]
pub fn get_projects() -> Result<Vec<ProjectInfo>, String> {
    let name_map = build_project_name_map()?;
    let mut projects = Vec::new();

    for (name, dirs) in &name_map {
        // Quick check: at least one directory has non-empty JSONL files
        let active = dirs.iter().any(|dir| has_any_activity(dir));
        if !active {
            continue;
        }

        projects.push(ProjectInfo {
            name: name.clone(),
            path: name.clone(),
        });
    }

    projects.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(projects)
}

#[tauri::command]
pub fn get_statistics(
    project: Option<String>,
    time_filter: String,
    provider_filter: Option<String>,
) -> Result<Statistics, String> {
    get_statistics_internal(project, time_filter, provider_filter)
}

pub fn get_statistics_internal(
    project: Option<String>,
    time_filter: String,
    provider_filter: Option<String>,
) -> Result<Statistics, String> {
    let filter = parse_time_filter(time_filter.as_str());

    let mut all_stats = ProjectStats::default();

    let name_map = build_project_name_map()?;

    // If specific project is selected (by display name)
    if let Some(project_name) = project {
        let dirs = name_map
            .get(&project_name)
            .ok_or_else(|| format!("Project not found: {}", project_name))?;

        for dir in dirs {
            match collect_project_stats(dir, &filter, &provider_filter) {
                Ok(stats) => all_stats.merge(stats),
                Err(e) => {
                    eprintln!("Error collecting stats for {:?}: {}", dir, e);
                }
            }
        }

        return Ok(all_stats.to_statistics());
    }

    // Collect all projects
    for dirs in name_map.values() {
        for dir in dirs {
            match collect_project_stats(dir, &filter, &provider_filter) {
                Ok(stats) => all_stats.merge(stats),
                Err(e) => {
                    eprintln!("Error collecting stats for {:?}: {}", dir, e);
                }
            }
        }
    }

    Ok(all_stats.to_statistics())
}

fn collect_project_stats(project_path: &PathBuf, time_filter: &TimeFilter, provider_filter: &Option<String>) -> Result<ProjectStats, String> {
    let mut stats = ProjectStats::default();

    // Find all jsonl files in the project directory
    let entries = fs::read_dir(project_path).map_err(|e| format!("Failed to read project dir: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();

        // Filter by time
        if !filter_by_time(time_filter, &path) {
            continue;
        }

        // Only process jsonl files
        if let Some(ext) = path.extension() {
            if ext == "jsonl" {
                match parse_session_file(&path, time_filter) {
                    Ok(session_stats) if session_stats.has_activity => {
                        // Apply provider filter: skip sessions whose primary_model doesn't belong to the provider
                        if let Some(ref provider) = provider_filter {
                            let matches = session_stats
                                .primary_model
                                .as_ref()
                                .map(|m| model_matches_provider(m, provider))
                                .unwrap_or(false);
                            if !matches {
                                continue;
                            }
                        }
                        stats.merge_session(session_stats);
                    }
                    Ok(_) => {}
                    Err(e) => {
                        eprintln!("Error parsing {:?}: {}", path, e);
                    }
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
    provider_filter: Option<String>,
) -> Result<Vec<SessionInfo>, String> {
    let filter = parse_time_filter(time_filter.as_str());

    let name_map = build_project_name_map()?;
    let mut sessions: Vec<SessionInfo> = Vec::new();

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
                if !filter_by_time(&filter, &path) {
                    continue;
                }

                let session_stats = match parse_session_file(&path, &filter) {
                    Ok(s) if s.has_activity => s,
                    _ => continue,
                };

                // Apply provider filter
                if let Some(ref provider) = provider_filter {
                    let matches = session_stats
                        .primary_model
                        .as_ref()
                        .map(|m| model_matches_provider(m, provider))
                        .unwrap_or(false);
                    if !matches {
                        continue;
                    }
                }

                let total_tokens = session_stats.tokens.input
                    + session_stats.tokens.output
                    + session_stats.tokens.cache_read
                    + session_stats.tokens.cache_creation;

                sessions.push(SessionInfo {
                    session_id: session_stats
                        .session_id
                        .unwrap_or_else(|| "unknown".to_string()),
                    project_name: project_name.clone(),
                    timestamp: session_stats
                        .first_timestamp
                        .unwrap_or_else(|| "".to_string()),
                    duration_ms: session_stats.duration_ms,
                    duration_formatted: format_duration(session_stats.duration_ms),
                    total_tokens,
                    instructions: session_stats.instructions,
                    model: session_stats
                        .primary_model
                        .unwrap_or_else(|| "unknown".to_string()),
                    git_branch: session_stats
                        .git_branch
                        .unwrap_or_else(|| "".to_string()),
                    cost_usd: session_stats.cost_usd,
                });
            }
        }
    }

    // Sort by timestamp descending
    sessions.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    Ok(sessions)
}

#[tauri::command]
pub fn get_instructions(
    project: Option<String>,
    time_filter: String,
    provider_filter: Option<String>,
) -> Result<Vec<InstructionInfo>, String> {
    let filter = parse_time_filter(time_filter.as_str());

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
                if !filter_by_time(&filter, &path) {
                    continue;
                }

                // Apply provider filter: parse session to check primary_model
                if let Some(ref provider) = provider_filter {
                    let session_stats = match parse_session_file(&path, &filter) {
                        Ok(s) => s,
                        Err(_) => continue,
                    };
                    let matches = session_stats
                        .primary_model
                        .as_ref()
                        .map(|m| model_matches_provider(m, provider))
                        .unwrap_or(false);
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

    // Sort by timestamp descending
    instructions.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    Ok(instructions)
}

#[tauri::command]
pub fn update_tray_stats(app: tauri::AppHandle) {
    crate::tray::update_tray(&app);
}

#[tauri::command]
pub fn get_available_providers() -> Result<Vec<String>, String> {
    let name_map = build_project_name_map()?;
    let mut providers: HashSet<String> = HashSet::new();

    for dirs in name_map.values() {
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

                if let Ok(session_stats) = parse_session_file(&path, &TimeFilter::All) {
                    if session_stats.has_activity {
                        // Extract provider from each model key
                        for model_key in session_stats.tokens.by_model.keys() {
                            if let Some(provider) = model_to_provider(model_key) {
                                providers.insert(provider);
                            }
                        }
                    }
                }
            }
        }
    }

    let mut result: Vec<String> = providers.into_iter().collect();
    result.sort();
    Ok(result)
}
