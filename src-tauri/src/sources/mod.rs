use crate::normalized::NormalizedSession;
pub mod claude;
pub mod codex;
pub mod gemini;
pub mod hermes;
pub mod openclaw;
pub mod opencode;

use crate::commands::CustomProviderDef;
use crate::models::*;
use crate::parser::ProjectStats;
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedSourceInstance {
    pub id: String,
    pub source: SourceKind,
    pub label: String,
    pub root_path: PathBuf,
    pub built_in: bool,
}

fn default_root_for_source(source: SourceKind) -> PathBuf {
    let home = dirs::home_dir().unwrap_or_default();
    match source {
        SourceKind::ClaudeCode => home.join(".claude"),
        SourceKind::Codex => home.join(".codex"),
        SourceKind::Gemini => home.join(".gemini"),
        SourceKind::Opencode => home.join(".local").join("share").join("opencode"),
        SourceKind::Openclaw => home.join(".openclaw"),
        SourceKind::Hermes => home.join(".hermes"),
    }
}

pub fn default_source_instances() -> Vec<SourceInstanceConfig> {
    [
        SourceKind::ClaudeCode,
        SourceKind::Codex,
        SourceKind::Gemini,
        SourceKind::Opencode,
        SourceKind::Openclaw,
        SourceKind::Hermes,
    ]
    .into_iter()
    .map(|source| SourceInstanceConfig {
        id: format!("built-in:{}", source.as_str()),
        source,
        label: "Default".to_string(),
        root_path: default_root_for_source(source).to_string_lossy().to_string(),
        enabled: true,
        built_in: true,
    })
    .collect()
}

fn source_enabled(config: &SourceConfig, source: SourceKind) -> bool {
    match source {
        SourceKind::ClaudeCode => config.claude_code,
        SourceKind::Codex => config.codex,
        SourceKind::Gemini => config.gemini,
        SourceKind::Opencode => config.opencode,
        SourceKind::Openclaw => config.openclaw,
        SourceKind::Hermes => config.hermes,
    }
}

pub fn resolve_source_instances(query: Option<&SourceQueryConfig>) -> Vec<ResolvedSourceInstance> {
    let enabled_sources = query
        .and_then(|config| config.enabled_sources.clone())
        .unwrap_or_default();

    let instances = query
        .and_then(|config| config.source_instances.clone())
        .unwrap_or_else(default_source_instances);

    instances
        .into_iter()
        .filter(|instance| instance.enabled && source_enabled(&enabled_sources, instance.source))
        .filter_map(|instance| {
            let trimmed = instance.root_path.trim();
            if trimmed.is_empty() {
                return None;
            }

            Some(ResolvedSourceInstance {
                id: instance.id,
                source: instance.source,
                label: instance.label,
                root_path: PathBuf::from(trimmed),
                built_in: instance.built_in,
            })
        })
        .collect()
}

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
        ("hermes".to_string(), home.join(".hermes").join("state.db").exists()),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_source_instances_uses_built_in_defaults_when_query_is_missing() {
        let resolved = resolve_source_instances(None);

        assert_eq!(resolved.len(), 6);
        assert!(resolved.iter().any(|instance| instance.id == "built-in:codex"));
        assert!(resolved.iter().any(|instance| instance.id == "built-in:hermes"));
        assert!(resolved.iter().all(|instance| instance.built_in));
    }

    #[test]
    fn resolve_source_instances_filters_disabled_sources_and_instances() {
        let resolved = resolve_source_instances(Some(&SourceQueryConfig {
            enabled_sources: Some(SourceConfig {
                claude_code: false,
                codex: true,
                gemini: false,
                opencode: true,
                openclaw: true,
                hermes: false,
            }),
            source_instances: Some(vec![
                SourceInstanceConfig {
                    id: "codex:one".to_string(),
                    source: SourceKind::Codex,
                    label: "One".to_string(),
                    root_path: "/tmp/codex-one".to_string(),
                    enabled: true,
                    built_in: false,
                },
                SourceInstanceConfig {
                    id: "codex:disabled".to_string(),
                    source: SourceKind::Codex,
                    label: "Disabled".to_string(),
                    root_path: "/tmp/codex-disabled".to_string(),
                    enabled: false,
                    built_in: false,
                },
                SourceInstanceConfig {
                    id: "claude:one".to_string(),
                    source: SourceKind::ClaudeCode,
                    label: "Claude".to_string(),
                    root_path: "/tmp/claude".to_string(),
                    enabled: true,
                    built_in: false,
                },
            ]),
        }));

        assert_eq!(resolved.len(), 1);
        assert_eq!(resolved[0].id, "codex:one");
        assert_eq!(resolved[0].source, SourceKind::Codex);
    }
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
    if config.hermes {
        add_projects(hermes::discover_projects());
    }

    let mut projects: Vec<ProjectInfo> = project_map.into_values().collect();
    projects.sort_by(|a, b| a.name.cmp(&b.name));
    projects
}

pub fn collect_all_projects_from_query(query: Option<&SourceQueryConfig>) -> Vec<ProjectInfo> {
    let config = query
        .and_then(|value| value.enabled_sources.clone())
        .unwrap_or_default();
    let resolved_instances = resolve_source_instances(query);
    let mut project_map: HashMap<String, ProjectInfo> = HashMap::new();

    let mut add_projects = |projects: Vec<(String, String)>| {
        for (name, path) in projects {
            project_map
                .entry(name.clone())
                .or_insert_with(|| ProjectInfo { name, path });
        }
    };

    let claude_instances: Vec<_> = resolved_instances
        .iter()
        .filter(|instance| instance.source == SourceKind::ClaudeCode)
        .collect();
    if !claude_instances.is_empty() {
        for instance in claude_instances {
            add_projects(claude::discover_projects_from_root(&instance.root_path));
        }
    } else if config.claude_code {
        add_projects(claude::discover_projects());
    }

    let codex_instances: Vec<_> = resolved_instances
        .iter()
        .filter(|instance| instance.source == SourceKind::Codex)
        .collect();
    if !codex_instances.is_empty() {
        for instance in codex_instances {
            add_projects(codex::discover_projects_from_root(&instance.root_path));
        }
    } else if config.codex {
        add_projects(codex::discover_projects());
    }

    let gemini_instances: Vec<_> = resolved_instances
        .iter()
        .filter(|instance| instance.source == SourceKind::Gemini)
        .collect();
    if !gemini_instances.is_empty() {
        for instance in gemini_instances {
            add_projects(gemini::discover_projects_from_root(&instance.root_path));
        }
    } else if config.gemini {
        add_projects(gemini::discover_projects());
    }

    let opencode_instances: Vec<_> = resolved_instances
        .iter()
        .filter(|instance| instance.source == SourceKind::Opencode)
        .collect();
    if !opencode_instances.is_empty() {
        for instance in opencode_instances {
            add_projects(opencode::discover_projects_from_root(&instance.root_path));
        }
    } else if config.opencode {
        add_projects(opencode::discover_projects());
    }

    let openclaw_instances: Vec<_> = resolved_instances
        .iter()
        .filter(|instance| instance.source == SourceKind::Openclaw)
        .collect();
    if !openclaw_instances.is_empty() {
        for instance in openclaw_instances {
            add_projects(openclaw::discover_projects_from_root(&instance.root_path));
        }
    } else if config.openclaw {
        add_projects(openclaw::discover_projects());
    }

    let hermes_instances: Vec<_> = resolved_instances
        .iter()
        .filter(|instance| instance.source == SourceKind::Hermes)
        .collect();
    if !hermes_instances.is_empty() {
        for instance in hermes_instances {
            add_projects(hermes::discover_projects_from_root(&instance.root_path));
        }
    } else if config.hermes {
        add_projects(hermes::discover_projects());
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
    if config.hermes {
        sessions.extend(hermes::collect_normalized_sessions(project, query_range));
    }

    sessions
}

pub fn collect_all_normalized_sessions_from_query(
    project: Option<&[String]>,
    query_range: &QueryTimeRange,
    query: Option<&SourceQueryConfig>,
) -> Vec<NormalizedSession> {
    let config = query
        .and_then(|value| value.enabled_sources.clone())
        .unwrap_or_default();
    let resolved_instances = resolve_source_instances(query);
    let mut sessions = Vec::new();

    let claude_instances: Vec<_> = resolved_instances
        .iter()
        .filter(|instance| instance.source == SourceKind::ClaudeCode)
        .collect();
    if !claude_instances.is_empty() {
        for instance in claude_instances {
            let mut instance_sessions = claude::collect_normalized_sessions_from_root(
                &instance.root_path,
                project,
                query_range,
            );
            for session in &mut instance_sessions {
                session.instance_id = instance.id.clone();
                session.instance_label = instance.label.clone();
                session.instance_root_path = instance.root_path.to_string_lossy().to_string();
            }
            sessions.extend(instance_sessions);
        }
    } else if config.claude_code {
        sessions.extend(claude::collect_normalized_sessions(project, query_range));
    }

    let codex_instances: Vec<_> = resolved_instances
        .iter()
        .filter(|instance| instance.source == SourceKind::Codex)
        .collect();
    if !codex_instances.is_empty() {
        for instance in codex_instances {
            let mut instance_sessions = codex::collect_normalized_sessions_from_root(
                &instance.root_path,
                project,
                query_range,
            );
            for session in &mut instance_sessions {
                session.instance_id = instance.id.clone();
                session.instance_label = instance.label.clone();
                session.instance_root_path = instance.root_path.to_string_lossy().to_string();
            }
            sessions.extend(instance_sessions);
        }
    } else if config.codex {
        sessions.extend(codex::collect_normalized_sessions(project, query_range));
    }

    let gemini_instances: Vec<_> = resolved_instances
        .iter()
        .filter(|instance| instance.source == SourceKind::Gemini)
        .collect();
    if !gemini_instances.is_empty() {
        for instance in gemini_instances {
            let mut instance_sessions = gemini::collect_normalized_sessions_from_root(
                &instance.root_path,
                project,
                query_range,
            );
            for session in &mut instance_sessions {
                session.instance_id = instance.id.clone();
                session.instance_label = instance.label.clone();
                session.instance_root_path = instance.root_path.to_string_lossy().to_string();
            }
            sessions.extend(instance_sessions);
        }
    } else if config.gemini {
        sessions.extend(gemini::collect_normalized_sessions(project, query_range));
    }

    let opencode_instances: Vec<_> = resolved_instances
        .iter()
        .filter(|instance| instance.source == SourceKind::Opencode)
        .collect();
    if !opencode_instances.is_empty() {
        for instance in opencode_instances {
            let mut instance_sessions = opencode::collect_normalized_sessions_from_root(
                &instance.root_path,
                project,
                query_range,
            );
            for session in &mut instance_sessions {
                session.instance_id = instance.id.clone();
                session.instance_label = instance.label.clone();
                session.instance_root_path = instance.root_path.to_string_lossy().to_string();
            }
            sessions.extend(instance_sessions);
        }
    } else if config.opencode {
        sessions.extend(opencode::collect_normalized_sessions(project, query_range));
    }

    let openclaw_instances: Vec<_> = resolved_instances
        .iter()
        .filter(|instance| instance.source == SourceKind::Openclaw)
        .collect();
    if !openclaw_instances.is_empty() {
        for instance in openclaw_instances {
            let mut instance_sessions = openclaw::collect_normalized_sessions_from_root(
                &instance.root_path,
                project,
                query_range,
            );
            for session in &mut instance_sessions {
                session.instance_id = instance.id.clone();
                session.instance_label = instance.label.clone();
                session.instance_root_path = instance.root_path.to_string_lossy().to_string();
            }
            sessions.extend(instance_sessions);
        }
    } else if config.openclaw {
        sessions.extend(openclaw::collect_normalized_sessions(project, query_range));
    }

    let hermes_instances: Vec<_> = resolved_instances
        .iter()
        .filter(|instance| instance.source == SourceKind::Hermes)
        .collect();
    if !hermes_instances.is_empty() {
        for instance in hermes_instances {
            let mut instance_sessions = hermes::collect_normalized_sessions_from_root(
                &instance.root_path,
                project,
                query_range,
            );
            for session in &mut instance_sessions {
                session.instance_id = instance.id.clone();
                session.instance_label = instance.label.clone();
                session.instance_root_path = instance.root_path.to_string_lossy().to_string();
            }
            sessions.extend(instance_sessions);
        }
    } else if config.hermes {
        sessions.extend(hermes::collect_normalized_sessions(project, query_range));
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
    if config.hermes {
        all_stats.merge(hermes::collect_stats(
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
    if config.hermes {
        sessions.extend(hermes::collect_sessions(
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
    if config.hermes {
        instructions.extend(hermes::collect_instructions(
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
