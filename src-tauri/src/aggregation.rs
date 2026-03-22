use crate::commands::{model_matches_provider, model_to_provider, CustomProviderDef};
use crate::models::{
    CodeChanges, ExtensionChanges, InstructionInfo, ModelTokens, SessionInfo, Statistics,
    QueryTimeRange, TokenUsage,
};
use crate::normalized::{NormalizedRecord, NormalizedSession};
use crate::parser::format_duration;
use crate::time_ranges::record_matches_query_range;
use chrono::{DateTime, FixedOffset};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone)]
struct SessionAggregate {
    session_id: String,
    source: String,
    project_name: String,
    timestamp: String,
    duration_ms: u64,
    total_tokens: u64,
    instructions: u32,
    model: String,
    git_branch: String,
    cost_usd: f64,
    tokens: TokenUsage,
    code_changes: CodeChanges,
    tool_usage: HashMap<String, u32>,
    skill_usage: HashMap<String, u32>,
    mcp_usage: HashMap<String, u32>,
    instructions_list: Vec<InstructionInfo>,
}

pub fn aggregate_statistics(
    sessions: &[NormalizedSession],
    range: &QueryTimeRange,
    provider_filter: &Option<String>,
    custom_providers: &[CustomProviderDef],
) -> Statistics {
    let mut result = Statistics::default();

    for session in sessions {
        let Some(aggregate) =
            aggregate_session(session, range, provider_filter, custom_providers)
        else {
            continue;
        };

        result.sessions += 1;
        result.instructions += aggregate.instructions;
        if aggregate.duration_ms > 0 {
            result.duration_ms += aggregate.duration_ms;
        }
        result.cost_usd += aggregate.cost_usd;

        result.tokens.input += aggregate.tokens.input;
        result.tokens.output += aggregate.tokens.output;
        result.tokens.cache_read += aggregate.tokens.cache_read;
        result.tokens.cache_creation += aggregate.tokens.cache_creation;

        for (model, model_tokens) in aggregate.tokens.by_model {
            let entry = result.tokens.by_model.entry(model).or_default();
            entry.input += model_tokens.input;
            entry.output += model_tokens.output;
            entry.cache_read += model_tokens.cache_read;
            entry.cache_creation += model_tokens.cache_creation;
            entry.cost_usd += model_tokens.cost_usd;
        }

        result.code_changes.total.additions += aggregate.code_changes.total.additions;
        result.code_changes.total.deletions += aggregate.code_changes.total.deletions;
        result.code_changes.total.files += aggregate.code_changes.total.files;

        for (ext, changes) in aggregate.code_changes.by_extension {
            let entry = result.code_changes.by_extension.entry(ext).or_default();
            entry.additions += changes.additions;
            entry.deletions += changes.deletions;
            entry.files += changes.files;
        }

        merge_counter_map(&mut result.tool_usage, &aggregate.tool_usage);
        merge_counter_map(&mut result.skill_usage, &aggregate.skill_usage);
        merge_counter_map(&mut result.mcp_usage, &aggregate.mcp_usage);
    }

    result.duration_formatted = format_duration(result.duration_ms);
    result.dev_time.total_ms = result.duration_ms;
    result.dev_time.ai_time_ms = result.duration_ms;
    result.dev_time.user_time_ms = 0;
    result.dev_time.ai_ratio = if result.duration_ms > 0 { 100.0 } else { 0.0 };

    result
}

pub fn aggregate_sessions(
    sessions: &[NormalizedSession],
    range: &QueryTimeRange,
    provider_filter: &Option<String>,
    custom_providers: &[CustomProviderDef],
) -> Vec<SessionInfo> {
    let mut results = sessions
        .iter()
        .filter_map(|session| aggregate_session(session, range, provider_filter, custom_providers))
        .map(|aggregate| SessionInfo {
            session_id: aggregate.session_id,
            project_name: aggregate.project_name,
            timestamp: aggregate.timestamp,
            duration_ms: aggregate.duration_ms,
            duration_formatted: format_duration(aggregate.duration_ms),
            total_tokens: aggregate.total_tokens,
            instructions: aggregate.instructions,
            model: aggregate.model,
            git_branch: aggregate.git_branch,
            cost_usd: aggregate.cost_usd,
            source: aggregate.source,
        })
        .collect::<Vec<_>>();

    results.sort_by_key(|session| parse_timestamp_for_sort(&session.timestamp));
    results.reverse();
    results
}

pub fn aggregate_instructions(
    sessions: &[NormalizedSession],
    range: &QueryTimeRange,
    provider_filter: &Option<String>,
    custom_providers: &[CustomProviderDef],
) -> Vec<InstructionInfo> {
    let mut results = Vec::new();

    for session in sessions {
        let Some(aggregate) =
            aggregate_session(session, range, provider_filter, custom_providers)
        else {
            continue;
        };
        results.extend(aggregate.instructions_list);
    }

    results.sort_by_key(|instruction| parse_timestamp_for_sort(&instruction.timestamp));
    results.reverse();
    results
}

pub fn aggregate_available_providers(
    sessions: &[NormalizedSession],
    custom_providers: &[CustomProviderDef],
) -> Vec<String> {
    let mut providers = HashSet::new();

    for session in sessions {
        if let Some(provider) = session
            .provider
            .clone()
            .or_else(|| session.primary_model.as_deref().and_then(|m| model_to_provider(m, custom_providers)))
        {
            providers.insert(provider);
        }

        for record in &session.records {
            if let NormalizedRecord::Token(token) = record {
                if let Some(provider) = model_to_provider(&token.model, custom_providers) {
                    providers.insert(provider);
                }
            }
        }
    }

    let mut result = providers.into_iter().collect::<Vec<_>>();
    result.sort();
    result
}

fn aggregate_session(
    session: &NormalizedSession,
    range: &QueryTimeRange,
    provider_filter: &Option<String>,
    custom_providers: &[CustomProviderDef],
) -> Option<SessionAggregate> {
    let filtered_records = session
        .records
        .iter()
        .filter(|record| record_matches_query_range(range, record.timestamp()))
        .collect::<Vec<_>>();

    if filtered_records.is_empty() {
        return None;
    }

    let provider_match_vector = provider_filter.as_ref().map(|provider| {
        filtered_records
            .iter()
            .filter_map(|record| match record {
                NormalizedRecord::Token(token) => Some(model_matches_provider(
                    &token.model,
                    provider,
                    custom_providers,
                )),
                _ => None,
            })
            .collect::<Vec<_>>()
    });
    let matching_token_count = provider_match_vector
        .as_ref()
        .map(|matches| matches.iter().filter(|matched| **matched).count())
        .unwrap_or(0);
    let non_matching_token_count = provider_match_vector
        .as_ref()
        .map(|matches| matches.iter().filter(|matched| !**matched).count())
        .unwrap_or(0);
    let session_provider_matches = provider_filter
        .as_ref()
        .and_then(|provider| {
            session
                .primary_model
                .as_deref()
                .map(|model| model_matches_provider(model, provider, custom_providers))
        })
        .unwrap_or(true);
    let mut provider_matches = provider_filter.is_none()
        || matching_token_count > 0
        || (matching_token_count == 0
            && non_matching_token_count == 0
            && session_provider_matches);
    let allow_provider_agnostic_records = provider_filter.is_none()
        || matching_token_count > 0
        || (matching_token_count == 0
            && non_matching_token_count == 0
            && session_provider_matches);
    let mut earliest: Option<DateTime<FixedOffset>> = None;
    let mut latest: Option<DateTime<FixedOffset>> = None;
    let mut tokens = TokenUsage::default();
    let mut code_changes = CodeChanges::default();
    let mut tool_usage = HashMap::new();
    let mut skill_usage = HashMap::new();
    let mut mcp_usage = HashMap::new();
    let mut instructions_list = Vec::new();
    let mut changed_files_total = HashSet::new();
    let mut changed_files_by_extension: HashMap<String, HashSet<String>> = HashMap::new();
    let mut cost_usd = 0.0;

    for record in filtered_records {
        let timestamp = record.timestamp().to_rfc3339();
        let record_timestamp = record.timestamp().to_owned();
        let mut include_record = true;

        match record {
            NormalizedRecord::Instruction(instruction) => {
                if provider_filter.is_some() && !allow_provider_agnostic_records {
                    include_record = false;
                }
                if include_record {
                    instructions_list.push(InstructionInfo {
                        timestamp,
                        project_name: session.project_name.clone(),
                        session_id: session.session_id.clone(),
                        source: session.source.clone(),
                        content: instruction.content.clone(),
                    });
                }
            }
            NormalizedRecord::Token(token) => {
                if let Some(provider) = provider_filter {
                    if !model_matches_provider(&token.model, provider, custom_providers) {
                        include_record = false;
                    } else {
                        provider_matches = true;
                    }
                }
                if include_record {
                    tokens.input += token.input;
                    tokens.output += token.output;
                    tokens.cache_read += token.cache_read;
                    tokens.cache_creation += token.cache_creation;
                    cost_usd += token.cost_usd;

                    let model_tokens = tokens.by_model.entry(token.model.clone()).or_insert(ModelTokens {
                        input: 0,
                        output: 0,
                        cache_read: 0,
                        cache_creation: 0,
                        cost_usd: 0.0,
                    });
                    model_tokens.input += token.input;
                    model_tokens.output += token.output;
                    model_tokens.cache_read += token.cache_read;
                    model_tokens.cache_creation += token.cache_creation;
                    model_tokens.cost_usd += token.cost_usd;
                }
            }
            NormalizedRecord::Tool(tool) => {
                if provider_filter.is_some() && !allow_provider_agnostic_records {
                    include_record = false;
                }
                if include_record {
                    *tool_usage.entry(tool.name.clone()).or_insert(0) += 1;
                    if let Some(skill_name) = &tool.skill_name {
                        *skill_usage.entry(skill_name.clone()).or_insert(0) += 1;
                    }
                    if let Some(mcp_name) = &tool.mcp_name {
                        *mcp_usage.entry(mcp_name.clone()).or_insert(0) += 1;
                    }
                }
            }
            NormalizedRecord::CodeChange(change) => {
                if provider_filter.is_some() && !allow_provider_agnostic_records {
                    include_record = false;
                }
                if include_record {
                    code_changes.total.additions += change.additions;
                    code_changes.total.deletions += change.deletions;

                    if changed_files_total.insert(change.file_path.clone()) {
                        code_changes.total.files += change.files.max(1);
                    }

                    let entry = code_changes
                        .by_extension
                        .entry(change.extension.clone())
                        .or_insert(ExtensionChanges {
                            additions: 0,
                            deletions: 0,
                            files: 0,
                        });
                    entry.additions += change.additions;
                    entry.deletions += change.deletions;

                    let files = changed_files_by_extension
                        .entry(change.extension.clone())
                        .or_default();
                    if files.insert(change.file_path.clone()) {
                        entry.files += change.files.max(1);
                    }
                }
            }
        }

        if !include_record {
            continue;
        }

        if earliest
            .as_ref()
            .map(|value| record_timestamp < *value)
            .unwrap_or(true)
        {
            earliest = Some(record_timestamp);
        }
        if latest
            .as_ref()
            .map(|value| record.timestamp() > value)
            .unwrap_or(true)
        {
            latest = Some(record.timestamp().to_owned());
        }
    }

    if !provider_matches {
        return None;
    }

    let timestamp = earliest
        .as_ref()
        .map(|value| value.to_rfc3339())
        .unwrap_or_default();
    let duration_ms = match (earliest.as_ref(), latest.as_ref()) {
        (Some(start), Some(end)) if end > start => (*end - *start).num_milliseconds().max(0) as u64,
        _ => 0,
    };

    let total_tokens =
        tokens.input + tokens.output + tokens.cache_read + tokens.cache_creation;
    let model = tokens
        .by_model
        .keys()
        .next()
        .cloned()
        .or_else(|| session.primary_model.clone())
        .unwrap_or_else(|| "unknown".to_string());

    Some(SessionAggregate {
        session_id: session.session_id.clone(),
        source: session.source.clone(),
        project_name: session.project_name.clone(),
        timestamp,
        duration_ms,
        total_tokens,
        instructions: instructions_list.len() as u32,
        model,
        git_branch: session.git_branch.clone().unwrap_or_default(),
        cost_usd,
        tokens,
        code_changes,
        tool_usage,
        skill_usage,
        mcp_usage,
        instructions_list,
    })
}

fn merge_counter_map(target: &mut HashMap<String, u32>, source: &HashMap<String, u32>) {
    for (name, count) in source {
        *target.entry(name.clone()).or_insert(0) += count;
    }
}

fn parse_timestamp_for_sort(value: &str) -> i64 {
    chrono::DateTime::parse_from_rfc3339(value)
        .map(|value| value.timestamp_millis())
        .unwrap_or(i64::MIN)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::normalized::{
        CodeChangeRecord, InstructionRecord, NormalizedRecord, NormalizedSession, TokenRecord,
        ToolRecord,
    };
    use chrono::DateTime;

    fn ts(value: &str) -> chrono::DateTime<chrono::FixedOffset> {
        DateTime::parse_from_rfc3339(value).unwrap()
    }

    fn session(records: Vec<NormalizedRecord>) -> NormalizedSession {
        NormalizedSession {
            source: "claude_code".to_string(),
            session_id: "session-1".to_string(),
            project_name: "cc-statistics".to_string(),
            git_branch: Some("main".to_string()),
            primary_model: Some("claude-sonnet-4-5".to_string()),
            provider: Some("Anthropic".to_string()),
            records,
        }
    }

    #[test]
    fn zero_duration_session_does_not_contribute_duration_total() {
        let sessions = vec![session(vec![NormalizedRecord::Instruction(
            InstructionRecord {
                timestamp: ts("2026-03-10T09:00:00+08:00"),
                content: "hello".to_string(),
            },
        )])];
        let range = QueryTimeRange::BuiltIn {
            key: crate::models::BuiltInTimeRangeKey::All,
        };

        let stats = aggregate_statistics(&sessions, &range, &None, &[]);
        assert_eq!(stats.sessions, 1);
        assert_eq!(stats.instructions, 1);
        assert_eq!(stats.duration_ms, 0);
    }

    #[test]
    fn aggregator_counts_tokens_tools_skills_mcp_and_code_changes_from_same_filtered_set() {
        let sessions = vec![session(vec![
            NormalizedRecord::Instruction(InstructionRecord {
                timestamp: ts("2026-03-10T09:00:00+08:00"),
                content: "ship it".to_string(),
            }),
            NormalizedRecord::Token(TokenRecord {
                timestamp: ts("2026-03-10T09:01:00+08:00"),
                model: "claude-sonnet-4-5".to_string(),
                input: 10,
                output: 20,
                cache_read: 5,
                cache_creation: 2,
                cost_usd: 1.25,
            }),
            NormalizedRecord::Tool(ToolRecord {
                timestamp: ts("2026-03-10T09:02:00+08:00"),
                name: "mcp__filesystem__read_file".to_string(),
                skill_name: Some("brainstorming".to_string()),
                mcp_name: Some("mcp__filesystem__read_file".to_string()),
            }),
            NormalizedRecord::CodeChange(CodeChangeRecord {
                timestamp: ts("2026-03-10T09:03:00+08:00"),
                file_path: "src/main.rs".to_string(),
                extension: "rs".to_string(),
                additions: 4,
                deletions: 1,
                files: 1,
            }),
        ])];
        let range = QueryTimeRange::Absolute {
            start_date: "2026-03-10".to_string(),
            end_date: "2026-03-10".to_string(),
        };

        let stats = aggregate_statistics(&sessions, &range, &None, &[]);
        assert_eq!(stats.sessions, 1);
        assert_eq!(stats.instructions, 1);
        assert_eq!(stats.duration_ms, 180_000);
        assert_eq!(stats.tokens.input, 10);
        assert_eq!(stats.tokens.output, 20);
        assert_eq!(stats.tokens.cache_read, 5);
        assert_eq!(stats.tokens.cache_creation, 2);
        assert_eq!(stats.cost_usd, 1.25);
        assert_eq!(stats.tool_usage.get("mcp__filesystem__read_file"), Some(&1));
        assert_eq!(stats.skill_usage.get("brainstorming"), Some(&1));
        assert_eq!(stats.mcp_usage.get("mcp__filesystem__read_file"), Some(&1));
        assert_eq!(stats.code_changes.total.additions, 4);
        assert_eq!(stats.code_changes.total.deletions, 1);
        assert_eq!(stats.code_changes.total.files, 1);
    }

    #[test]
    fn provider_filter_includes_code_changes_when_matching_tokens_exist_in_mixed_session() {
        let sessions = vec![NormalizedSession {
            source: "codex".to_string(),
            session_id: "mixed-provider".to_string(),
            project_name: "cc-statistics".to_string(),
            git_branch: Some("main".to_string()),
            primary_model: Some("claude-sonnet-4-5".to_string()),
            provider: None,
            records: vec![
                NormalizedRecord::Instruction(InstructionRecord {
                    timestamp: ts("2026-03-10T09:00:00+08:00"),
                    content: "ambiguous instruction".to_string(),
                }),
                NormalizedRecord::Token(TokenRecord {
                    timestamp: ts("2026-03-10T09:01:00+08:00"),
                    model: "claude-sonnet-4-5".to_string(),
                    input: 10,
                    output: 20,
                    cache_read: 0,
                    cache_creation: 0,
                    cost_usd: 1.0,
                }),
                NormalizedRecord::Token(TokenRecord {
                    timestamp: ts("2026-03-10T09:02:00+08:00"),
                    model: "gpt-5.4".to_string(),
                    input: 3,
                    output: 4,
                    cache_read: 0,
                    cache_creation: 0,
                    cost_usd: 0.5,
                }),
                NormalizedRecord::CodeChange(CodeChangeRecord {
                    timestamp: ts("2026-03-10T09:03:00+08:00"),
                    file_path: "src/main.rs".to_string(),
                    extension: "rs".to_string(),
                    additions: 10,
                    deletions: 3,
                    files: 1,
                }),
            ],
        }];
        let range = QueryTimeRange::BuiltIn {
            key: crate::models::BuiltInTimeRangeKey::All,
        };

        // Filter by Anthropic: should include only Anthropic tokens but ALSO code changes + instructions
        let provider = Some("Anthropic".to_string());
        let stats = aggregate_statistics(&sessions, &range, &provider, &[]);
        assert_eq!(stats.sessions, 1);
        assert_eq!(stats.tokens.input, 10); // only Anthropic tokens
        assert_eq!(stats.tokens.output, 20);
        assert_eq!(stats.cost_usd, 1.0);
        // Code changes should be included even in mixed-provider session
        assert_eq!(stats.code_changes.total.additions, 10);
        assert_eq!(stats.code_changes.total.deletions, 3);
        assert_eq!(stats.code_changes.total.files, 1);
        // Instructions should be included too
        assert_eq!(stats.instructions, 1);

        // Filter by OpenAI: should include only OpenAI tokens and also code changes
        let provider = Some("OpenAI".to_string());
        let stats = aggregate_statistics(&sessions, &range, &provider, &[]);
        assert_eq!(stats.sessions, 1);
        assert_eq!(stats.tokens.input, 3); // only OpenAI tokens
        assert_eq!(stats.tokens.output, 4);
        assert_eq!(stats.cost_usd, 0.5);
        assert_eq!(stats.code_changes.total.additions, 10);
        assert_eq!(stats.code_changes.total.deletions, 3);
        assert_eq!(stats.code_changes.total.files, 1);
    }
}
