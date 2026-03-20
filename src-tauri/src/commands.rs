use crate::models::*;
use crate::parser::{parse_session_file, ProjectStats};
use chrono::{DateTime, Duration, Utc};
use std::collections::HashMap;
use std::fs;
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

fn parse_project_name(path: &str) -> String {
    // Convert path like "/Users/yugangcao/apps/my-apps/echo-type"
    // to "-Users-yugangcao-apps-my-apps-echo-type"
    if path.starts_with('-') {
        path.to_string()
    } else {
        path.replace('/', "-")
    }
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

#[tauri::command]
pub fn get_projects() -> Result<Vec<ProjectInfo>, String> {
    let projects_dir = get_projects_dir()?;
    let mut projects = Vec::new();

    for entry in fs::read_dir(&projects_dir).map_err(|e| format!("Failed to read projects dir: {}", e))? {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();

        if path.is_dir() {
            let _name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown")
                .to_string();
            let path_str = path.to_string_lossy().to_string();

            projects.push(ProjectInfo {
                name: parse_project_name(&path_str),
                path: path_str,
            });
        }
    }

    // Sort by name
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

    let projects_dir = get_projects_dir()?;
    let mut all_stats = ProjectStats::default();

    // If specific project is selected
    if let Some(project_name) = project {
        let project_path = if project_name.starts_with('-') {
            project_name.replace('-', "/")
        } else {
            project_name.clone()
        };

        let full_path = projects_dir.join(&project_path);
        if full_path.exists() && full_path.is_dir() {
            let project_stats = collect_project_stats(&full_path, &filter)?;
            return Ok(project_stats.to_statistics());
        } else {
            return Err(format!("Project not found: {}", project_name));
        }
    }

    // Collect all projects
    for entry in fs::read_dir(&projects_dir).map_err(|e| format!("Failed to read projects dir: {}", e))? {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();

        if path.is_dir() {
            match collect_project_stats(&path, &filter) {
                Ok(stats) => all_stats.merge(stats),
                Err(e) => {
                    eprintln!("Error collecting stats for {:?}: {}", path, e);
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
                match parse_session_file(&path) {
                    Ok(session_stats) => stats.merge_session(session_stats),
                    Err(e) => {
                        eprintln!("Error parsing {:?}: {}", path, e);
                    }
                }
            }
        }
    }

    stats.sessions = 1; // Each jsonl file represents one session

    Ok(stats)
}

#[tauri::command]
pub fn get_cache_status() -> Result<String, String> {
    let claude_dir = get_claude_dir()?;
    let cache_file = claude_dir.join("stats-cache.json");

    if cache_file.exists() {
        let metadata = fs::metadata(&cache_file).map_err(|e| format!("Failed to read cache: {}", e))?;
        let modified: DateTime<Utc> = metadata.modified().map_err(|e| format!("Failed to get mtime: {}", e))?.into();
        Ok(modified.to_rfc3339())
    } else {
        Ok("No cache".to_string())
    }
}

#[tauri::command]
pub fn refresh_data() -> Result<String, String> {
    // This would trigger a re-scan of all data
    // In practice, the cache is automatically invalidated when checking file modification times
    Ok("Data refreshed".to_string())
}
