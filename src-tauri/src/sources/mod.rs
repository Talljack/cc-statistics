use crate::normalized::NormalizedSession;
pub mod claude;
pub mod codex;
pub mod gemini;
pub mod openclaw;
pub mod opencode;

use crate::commands::CustomProviderDef;
use crate::models::*;
use crate::parser::ProjectStats;
use std::collections::HashMap;

/// Detect which CLI data sources are installed on this machine
pub fn detect_installed_sources() -> Vec<(String, bool)> {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return vec![],
    };

    vec![
        (
            "claude_code".to_string(),
            home.join(".claude").join("projects").exists(),
        ),
        ("codex".to_string(), home.join(".codex").exists()),
        ("gemini".to_string(), home.join(".gemini").exists()),
        (
            "opencode".to_string(),
            home.join(".local/share/opencode/opencode.db").exists(),
        ),
        ("openclaw".to_string(), home.join(".openclaw").exists()),
    ]
}

/// Collect projects from all enabled sources, deduplicated by name
pub fn collect_all_projects(config: &SourceConfig) -> Vec<ProjectInfo> {
    let mut project_map: HashMap<String, ProjectInfo> = HashMap::new();

    let mut add_projects = |projects: Vec<(String, String)>| {
        for (name, path) in projects {
            project_map
                .entry(name.clone())
                .or_insert_with(|| ProjectInfo { name, path });
        }
    };

    if config.claude_code {
        add_projects(claude::discover_projects());
    }
    if config.codex {
        add_projects(codex::discover_projects());
    }
    if config.gemini {
        add_projects(gemini::discover_projects());
    }
    if config.opencode {
        add_projects(opencode::discover_projects());
    }
    if config.openclaw {
        add_projects(openclaw::discover_projects());
    }

    let mut projects: Vec<ProjectInfo> = project_map.into_values().collect();
    projects.sort_by(|a, b| a.name.cmp(&b.name));
    projects
}

pub fn collect_all_normalized_sessions(
    project: Option<&[String]>,
    query_range: &QueryTimeRange,
    config: &SourceConfig,
) -> Vec<NormalizedSession> {
    let mut sessions = Vec::new();

    if config.claude_code {
        sessions.extend(claude::collect_normalized_sessions(project, query_range));
    }
    if config.codex {
        sessions.extend(codex::collect_normalized_sessions(project, query_range));
    }
    if config.gemini {
        sessions.extend(gemini::collect_normalized_sessions(project, query_range));
    }
    if config.opencode {
        sessions.extend(opencode::collect_normalized_sessions(project, query_range));
    }
    if config.openclaw {
        sessions.extend(openclaw::collect_normalized_sessions(project, query_range));
    }

    sessions
}

/// Collect aggregated statistics from all enabled sources
pub fn collect_all_stats(
    project: Option<&[String]>,
    time_filter: &TimeFilter,
    query_range: &Option<QueryTimeRange>,
    provider_filter: &Option<Vec<String>>,
    custom_providers: &[CustomProviderDef],
    config: &SourceConfig,
) -> ProjectStats {
    let mut all_stats = ProjectStats::default();

    if config.claude_code {
        all_stats.merge(claude::collect_stats(
            project,
            time_filter,
            query_range,
            provider_filter,
            custom_providers,
        ));
    }
    if config.codex {
        all_stats.merge(codex::collect_stats(
            project,
            time_filter,
            provider_filter,
            custom_providers,
        ));
    }
    if config.gemini {
        all_stats.merge(gemini::collect_stats(
            project,
            time_filter,
            provider_filter,
            custom_providers,
        ));
    }
    if config.opencode {
        all_stats.merge(opencode::collect_stats(
            project,
            time_filter,
            provider_filter,
            custom_providers,
        ));
    }
    if config.openclaw {
        all_stats.merge(openclaw::collect_stats(
            project,
            time_filter,
            provider_filter,
            custom_providers,
        ));
    }

    all_stats
}

/// Collect sessions from all enabled sources
pub fn collect_all_sessions(
    project: Option<&[String]>,
    time_filter: &TimeFilter,
    query_range: &Option<QueryTimeRange>,
    provider_filter: &Option<Vec<String>>,
    custom_providers: &[CustomProviderDef],
    config: &SourceConfig,
) -> Vec<SessionInfo> {
    let mut sessions = Vec::new();

    if config.claude_code {
        sessions.extend(claude::collect_sessions(
            project,
            time_filter,
            query_range,
            provider_filter,
            custom_providers,
        ));
    }
    if config.codex {
        sessions.extend(codex::collect_sessions(
            project,
            time_filter,
            provider_filter,
            custom_providers,
        ));
    }
    if config.gemini {
        sessions.extend(gemini::collect_sessions(
            project,
            time_filter,
            provider_filter,
            custom_providers,
        ));
    }
    if config.opencode {
        sessions.extend(opencode::collect_sessions(
            project,
            time_filter,
            provider_filter,
            custom_providers,
        ));
    }
    if config.openclaw {
        sessions.extend(openclaw::collect_sessions(
            project,
            time_filter,
            provider_filter,
            custom_providers,
        ));
    }

    sessions.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    sessions
}

/// Collect instructions from all enabled sources
pub fn collect_all_instructions(
    project: Option<&[String]>,
    time_filter: &TimeFilter,
    query_range: &Option<QueryTimeRange>,
    provider_filter: &Option<Vec<String>>,
    custom_providers: &[CustomProviderDef],
    config: &SourceConfig,
) -> Vec<InstructionInfo> {
    let mut instructions = Vec::new();

    if config.claude_code {
        instructions.extend(claude::collect_instructions(
            project,
            time_filter,
            query_range,
            provider_filter,
            custom_providers,
        ));
    }
    if config.codex {
        instructions.extend(codex::collect_instructions(
            project,
            time_filter,
            query_range,
            provider_filter,
            custom_providers,
        ));
    }
    if config.gemini {
        instructions.extend(gemini::collect_instructions(
            project,
            time_filter,
            query_range,
            provider_filter,
            custom_providers,
        ));
    }
    if config.opencode {
        instructions.extend(opencode::collect_instructions(
            project,
            time_filter,
            query_range,
            provider_filter,
            custom_providers,
        ));
    }
    if config.openclaw {
        instructions.extend(openclaw::collect_instructions(
            project,
            time_filter,
            query_range,
            provider_filter,
            custom_providers,
        ));
    }

    instructions.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    instructions
}

/// Collect available providers from all enabled sources
pub fn collect_all_providers(
    custom_providers: &[CustomProviderDef],
    config: &SourceConfig,
) -> Vec<String> {
    use crate::commands::model_to_provider;
    use std::collections::HashSet;

    let mut providers: HashSet<String> = HashSet::new();

    // Collect from all session data across sources
    let all_sessions = collect_all_sessions(
        None,
        &TimeFilter::All,
        &None,
        &None,
        custom_providers,
        config,
    );
    for session in &all_sessions {
        if let Some(provider) = model_to_provider(&session.model, custom_providers) {
            providers.insert(provider);
        }
    }

    let mut result: Vec<String> = providers.into_iter().collect();
    result.sort();
    result
}
