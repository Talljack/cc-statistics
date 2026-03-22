use crate::models::*;
use crate::normalized::NormalizedSession;
use crate::parser::{extract_instructions, format_duration, parse_session_file, ProjectStats};
use crate::parser::parse_normalized_session_file;
use crate::commands::{model_matches_provider, filter_by_time, CustomProviderDef};
use crate::time_ranges::filter_by_query_range;
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;

fn get_projects_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    let projects_dir = home.join(".claude").join("projects");
    if !projects_dir.exists() {
        return Err("Claude projects directory not found".to_string());
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

            if let Some(name) = find_project_root_name(&cwd) {
                return name;
            }
        }
    }

    internal_name.trim_start_matches('-').to_string()
}

/// Find project root from a cwd path and return the directory name
pub(crate) fn find_project_root_name(cwd: &PathBuf) -> Option<String> {
    let root = cwd
        .ancestors()
        .find(|ancestor| {
            ancestor.join(".git").exists()
                || ancestor.join("package.json").exists()
                || ancestor.join("Cargo.toml").exists()
                || ancestor.join("pnpm-lock.yaml").exists()
        })
        .unwrap_or(cwd.as_path());

    root.file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .map(|name| name.to_string())
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

pub fn discover_projects() -> Vec<(String, String)> {
    let name_map = match build_project_name_map() {
        Ok(m) => m,
        Err(_) => return vec![],
    };

    let mut projects = Vec::new();
    for (name, dirs) in &name_map {
        let active = dirs.iter().any(|dir| has_any_activity(dir));
        if !active {
            continue;
        }
        projects.push((name.clone(), name.clone()));
    }
    projects.sort();
    projects
}

pub fn collect_stats(
    project: Option<&str>,
    time_filter: &TimeFilter,
    query_range: &Option<QueryTimeRange>,
    provider_filter: &Option<String>,
    custom_providers: &[CustomProviderDef],
) -> ProjectStats {
    let name_map = match build_project_name_map() {
        Ok(m) => m,
        Err(_) => return ProjectStats::default(),
    };

    let mut all_stats = ProjectStats::default();

    let dirs_to_scan: Vec<&PathBuf> = if let Some(project_name) = project {
        match name_map.get(project_name) {
            Some(dirs) => dirs.iter().collect(),
            None => return ProjectStats::default(),
        }
    } else {
        name_map.values().flat_map(|dirs| dirs.iter()).collect()
    };

    for dir in dirs_to_scan {
        match collect_project_stats(dir, time_filter, query_range, provider_filter, custom_providers) {
            Ok(stats) => all_stats.merge(stats),
            Err(e) => eprintln!("Error collecting Claude stats for {:?}: {}", dir, e),
        }
    }

    all_stats
}

fn collect_project_stats(
    project_path: &PathBuf,
    time_filter: &TimeFilter,
    query_range: &Option<QueryTimeRange>,
    provider_filter: &Option<String>,
    custom_providers: &[CustomProviderDef],
) -> Result<ProjectStats, String> {
    let mut stats = ProjectStats::default();

    let entries = fs::read_dir(project_path)
        .map_err(|e| format!("Failed to read project dir: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();

        let passes = match query_range {
            Some(qr) => filter_by_query_range(qr, &path),
            None => filter_by_time(time_filter, &path),
        };
        if !passes {
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
                    Err(e) => eprintln!("Error parsing {:?}: {}", path, e),
                }
            }
        }
    }

    Ok(stats)
}

pub fn collect_sessions(
    project: Option<&str>,
    time_filter: &TimeFilter,
    query_range: &Option<QueryTimeRange>,
    provider_filter: &Option<String>,
    custom_providers: &[CustomProviderDef],
) -> Vec<SessionInfo> {
    let name_map = match build_project_name_map() {
        Ok(m) => m,
        Err(_) => return vec![],
    };

    let mut sessions: Vec<SessionInfo> = Vec::new();

    let target_dirs: Vec<(String, &Vec<PathBuf>)> = if let Some(project_name) = project {
        match name_map.get(project_name) {
            Some(dirs) => vec![(project_name.to_string(), dirs)],
            None => return vec![],
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
                let passes = match query_range {
                    Some(qr) => filter_by_query_range(qr, &path),
                    None => filter_by_time(time_filter, &path),
                };
                if !passes {
                    continue;
                }

                let session_stats = match parse_session_file(&path, time_filter) {
                    Ok(s) if s.has_activity => s,
                    _ => continue,
                };

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

                let total_tokens = session_stats.tokens.input
                    + session_stats.tokens.output
                    + session_stats.tokens.cache_read
                    + session_stats.tokens.cache_creation;

                sessions.push(SessionInfo {
                    session_id: session_stats.session_id.unwrap_or_else(|| "unknown".to_string()),
                    project_name: project_name.clone(),
                    timestamp: session_stats.first_timestamp.unwrap_or_default(),
                    duration_ms: session_stats.duration_ms,
                    duration_formatted: format_duration(session_stats.duration_ms),
                    total_tokens,
                    instructions: session_stats.instructions,
                    model: session_stats.primary_model.unwrap_or_else(|| "unknown".to_string()),
                    git_branch: session_stats.git_branch.unwrap_or_default(),
                    cost_usd: session_stats.cost_usd,
                    source: "claude_code".to_string(),
                });
            }
        }
    }

    sessions
}

pub fn collect_normalized_sessions(
    project: Option<&str>,
    query_range: &QueryTimeRange,
) -> Vec<NormalizedSession> {
    let name_map = match build_project_name_map() {
        Ok(map) => map,
        Err(_) => return Vec::new(),
    };

    let target_dirs: Vec<(String, &Vec<PathBuf>)> = if let Some(project_name) = project {
        match name_map.get(project_name) {
            Some(dirs) => vec![(project_name.to_string(), dirs)],
            None => return Vec::new(),
        }
    } else {
        name_map.iter().map(|(k, v)| (k.clone(), v)).collect()
    };

    let mut sessions = Vec::new();

    for (project_name, dirs) in target_dirs {
        for dir in dirs {
            let entries = match fs::read_dir(dir) {
                Ok(entries) => entries,
                Err(_) => continue,
            };

            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|ext| ext.to_str()) != Some("jsonl") {
                    continue;
                }
                if !filter_by_query_range(query_range, &path) {
                    continue;
                }

                match parse_normalized_session_file(&path, &project_name) {
                    Ok(session) if !session.records.is_empty() => sessions.push(session),
                    Ok(_) => {}
                    Err(error) => eprintln!("Error parsing normalized Claude session {:?}: {}", path, error),
                }
            }
        }
    }

    sessions
}

pub fn collect_instructions(
    project: Option<&str>,
    time_filter: &TimeFilter,
    query_range: &Option<QueryTimeRange>,
    provider_filter: &Option<String>,
    custom_providers: &[CustomProviderDef],
) -> Vec<InstructionInfo> {
    let name_map = match build_project_name_map() {
        Ok(m) => m,
        Err(_) => return vec![],
    };

    let mut instructions: Vec<InstructionInfo> = Vec::new();

    let target_dirs: Vec<(String, &Vec<PathBuf>)> = if let Some(project_name) = project {
        match name_map.get(project_name) {
            Some(dirs) => vec![(project_name.to_string(), dirs)],
            None => return vec![],
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
                let passes = match query_range {
                    Some(qr) => filter_by_query_range(qr, &path),
                    None => filter_by_time(time_filter, &path),
                };
                if !passes {
                    continue;
                }

                if let Some(ref provider) = provider_filter {
                    let session_stats = match parse_session_file(&path, time_filter) {
                        Ok(s) => s,
                        Err(_) => continue,
                    };
                    let matches = session_stats
                        .tokens
                        .by_model
                        .keys()
                        .any(|m| model_matches_provider(m, provider, custom_providers));
                    if !matches {
                        continue;
                    }
                }

                let session_id = path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("unknown")
                    .to_string();

                let items = match extract_instructions(&path, time_filter) {
                    Ok(items) => items,
                    Err(_) => continue,
                };

                for (timestamp, content) in items {
                    instructions.push(InstructionInfo {
                        timestamp,
                        project_name: project_name.clone(),
                        session_id: session_id.clone(),
                        source: "claude_code".to_string(),
                        content,
                    });
                }
            }
        }
    }

    instructions
}
