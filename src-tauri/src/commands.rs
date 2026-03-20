use crate::models::*;
use crate::parser::{parse_session_file, ProjectStats};
use chrono::{DateTime, Duration, Utc};
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::sync::Mutex;

#[allow(unused_imports)]
use tauri::State;

pub struct AppState {
    pub cache: Mutex<CacheData>,
}

#[derive(Debug, Clone, Default)]
pub struct CacheData {
    pub projects: HashMap<String, ProjectStats>,
    pub last_updated: Option<String>,
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

    let now = Utc::now();
    let datetime: DateTime<Utc> = modified.into();

    match time_filter {
        TimeFilter::Today => {
            let today_start = now.date_naive().and_hms_opt(0, 0, 0).unwrap();
            datetime.with_timezone(&Utc) >= today_start.and_utc()
        }
        TimeFilter::Week => {
            let week_ago = now - Duration::days(7);
            datetime >= week_ago
        }
        TimeFilter::Month => {
            let month_ago = now - Duration::days(30);
            datetime >= month_ago
        }
        TimeFilter::All => true,
    }
}

fn has_usage(stats: &ProjectStats) -> bool {
    stats.sessions > 0
        || stats.instructions > 0
        || stats.duration_ms > 0
        || stats.tokens.input > 0
        || stats.tokens.output > 0
        || stats.tokens.cache_read > 0
        || stats.tokens.cache_creation > 0
        || stats.code_changes.total.additions > 0
        || stats.code_changes.total.deletions > 0
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
) -> Result<Statistics, String> {
    let filter = match time_filter.as_str() {
        "today" => TimeFilter::Today,
        "week" => TimeFilter::Week,
        "month" => TimeFilter::Month,
        _ => TimeFilter::All,
    };

    let mut all_stats = ProjectStats::default();

    let name_map = build_project_name_map()?;

    // If specific project is selected (by display name)
    if let Some(project_name) = project {
        let dirs = name_map
            .get(&project_name)
            .ok_or_else(|| format!("Project not found: {}", project_name))?;

        for dir in dirs {
            match collect_project_stats(dir, &filter) {
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
            match collect_project_stats(dir, &filter) {
                Ok(stats) => all_stats.merge(stats),
                Err(e) => {
                    eprintln!("Error collecting stats for {:?}: {}", dir, e);
                }
            }
        }
    }

    Ok(all_stats.to_statistics())
}

fn collect_project_stats(project_path: &PathBuf, time_filter: &TimeFilter) -> Result<ProjectStats, String> {
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
                    Ok(session_stats) if session_stats.has_activity => stats.merge_session(session_stats),
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
pub fn get_cache_status(state: State<AppState>) -> Result<String, String> {
    let cache = state
        .cache
        .lock()
        .map_err(|_| "Failed to acquire app state".to_string())?;

    Ok(cache
        .last_updated
        .clone()
        .unwrap_or_else(|| "Never".to_string()))
}

#[tauri::command]
pub fn refresh_data(state: State<AppState>) -> Result<String, String> {
    let name_map = build_project_name_map()?;
    let mut refreshed_projects = HashMap::new();

    for (name, dirs) in &name_map {
        let mut total_stats = ProjectStats::default();
        for dir in dirs {
            let stats = collect_project_stats(dir, &TimeFilter::All)?;
            total_stats.merge(stats);
        }

        if has_usage(&total_stats) {
            refreshed_projects.insert(name.clone(), total_stats);
        }
    }

    let refreshed_at = Utc::now().to_rfc3339();
    let mut cache = state
        .cache
        .lock()
        .map_err(|_| "Failed to acquire app state".to_string())?;
    cache.projects = refreshed_projects;
    cache.last_updated = Some(refreshed_at.clone());

    Ok(refreshed_at)
}
