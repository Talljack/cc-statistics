use crate::commands::{
    model_matches_provider_filters, model_to_provider, CustomProviderDef,
};
use crate::models::{
    CodeChanges, DevTime, ExtensionChanges, FileChange, InstructionInfo, ModelTokens,
    QueryTimeRange, SessionInfo, Statistics, TokenUsage,
};
use crate::normalized::{NormalizedRecord, NormalizedSession};
use crate::parser::format_duration;
use crate::time_ranges::record_matches_query_range;
use chrono::{DateTime, FixedOffset};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone)]
struct SessionAggregate {
    instance_id: String,
    instance_label: String,
    instance_root_path: String,
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
    dev_time: DevTime,
}

pub fn aggregate_statistics(
    sessions: &[NormalizedSession],
    range: &QueryTimeRange,
    provider_filter: &Option<Vec<String>>,
    custom_providers: &[CustomProviderDef],
) -> Statistics {
    let mut result = Statistics::default();

    for session in sessions {
        let Some(aggregate) = aggregate_session(session, range, provider_filter, custom_providers)
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

        result.dev_time.total_ms += aggregate.dev_time.total_ms;
        result.dev_time.ai_time_ms += aggregate.dev_time.ai_time_ms;
        result.dev_time.user_time_ms += aggregate.dev_time.user_time_ms;
    }

    result.duration_formatted = format_duration(result.duration_ms);

    // Dev time is already accumulated per-session via aggregate_session; no extra work needed.
    result.dev_time.ai_ratio = if result.dev_time.total_ms > 0 {
        (result.dev_time.ai_time_ms as f64 / result.dev_time.total_ms as f64) * 100.0
    } else {
        0.0
    };

    result
}

pub fn aggregate_sessions(
    sessions: &[NormalizedSession],
    range: &QueryTimeRange,
    provider_filter: &Option<Vec<String>>,
    custom_providers: &[CustomProviderDef],
) -> Vec<SessionInfo> {
    let mut results = sessions
        .iter()
        .filter_map(|session| aggregate_session(session, range, provider_filter, custom_providers))
        .map(|aggregate| SessionInfo {
            instance_id: aggregate.instance_id,
            instance_label: aggregate.instance_label,
            instance_root_path: aggregate.instance_root_path,
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
            input: aggregate.tokens.input,
            output: aggregate.tokens.output,
            cache_read: aggregate.tokens.cache_read,
            cache_creation: aggregate.tokens.cache_creation,
            tokens_by_model: aggregate.tokens.by_model,
        })
        .collect::<Vec<_>>();

    results.sort_by_key(|session| parse_timestamp_for_sort(&session.timestamp));
    results.reverse();
    results
}

pub fn aggregate_instructions(
    sessions: &[NormalizedSession],
    range: &QueryTimeRange,
    provider_filter: &Option<Vec<String>>,
    custom_providers: &[CustomProviderDef],
) -> Vec<InstructionInfo> {
    let mut results = Vec::new();

    for session in sessions {
        let Some(aggregate) = aggregate_session(session, range, provider_filter, custom_providers)
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
        if let Some(provider) = session.provider.clone().or_else(|| {
            session
                .primary_model
                .as_deref()
                .and_then(|m| model_to_provider(m, custom_providers))
        }) {
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

pub fn aggregate_code_changes_detail(
    sessions: &[NormalizedSession],
    range: &QueryTimeRange,
    provider_filter: &Option<Vec<String>>,
    custom_providers: &[CustomProviderDef],
) -> Vec<FileChange> {
    let mut results: Vec<(DateTime<FixedOffset>, FileChange)> = Vec::new();

    for session in sessions {
        let filtered_records = session
            .records
            .iter()
            .filter(|record| record_matches_query_range(range, record.timestamp()))
            .collect::<Vec<_>>();

        if filtered_records.is_empty() {
            continue;
        }

        // Determine provider match (same logic as aggregate_session)
        let provider_match_vector = provider_filter.as_deref().map(|providers| {
            filtered_records
                .iter()
                .filter_map(|record| match record {
                    NormalizedRecord::Token(token) => Some(model_matches_provider_filters(
                        &token.model,
                        Some(providers),
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
            .map(|providers| {
                session
                    .primary_model
                    .as_deref()
                    .map(|model| {
                        model_matches_provider_filters(model, Some(providers), custom_providers)
                    })
            })
            .flatten()
            .unwrap_or(true);
        let provider_matches = provider_filter.is_none()
            || matching_token_count > 0
            || (matching_token_count == 0
                && non_matching_token_count == 0
                && session_provider_matches);
        let allow_provider_agnostic_records = provider_filter.is_none()
            || matching_token_count > 0
            || (matching_token_count == 0
                && non_matching_token_count == 0
                && session_provider_matches);

        if !provider_matches {
            continue;
        }

        for record in &filtered_records {
            if let NormalizedRecord::CodeChange(change) = record {
                if provider_filter.is_some() && !allow_provider_agnostic_records {
                    continue;
                }
                if is_summary_only_code_change(change) {
                    continue;
                }

                let change_type = if change.deletions == 0 {
                    "create".to_string()
                } else {
                    "edit".to_string()
                };

                results.push((
                    change.timestamp,
                    FileChange {
                        file_path: change.file_path.clone(),
                        extension: change.extension.clone(),
                        change_type,
                        additions: change.additions,
                        deletions: change.deletions,
                        diff_content: change.diff_content.clone(),
                    },
                ));
            }
        }
    }

    results.sort_by(|(a_ts, a_change), (b_ts, b_change)| {
        b_ts.cmp(a_ts)
            .then_with(|| a_change.file_path.cmp(&b_change.file_path))
    });

    results.into_iter().map(|(_, change)| change).collect()
}

fn is_summary_only_code_change(change: &crate::normalized::CodeChangeRecord) -> bool {
    change.file_path.starts_with("session:")
        && change.extension == "summary"
        && change.diff_content.is_none()
}

fn aggregate_session(
    session: &NormalizedSession,
    range: &QueryTimeRange,
    provider_filter: &Option<Vec<String>>,
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

    let provider_match_vector = provider_filter.as_deref().map(|providers| {
        filtered_records
            .iter()
            .filter_map(|record| match record {
                NormalizedRecord::Token(token) => Some(model_matches_provider_filters(
                    &token.model,
                    Some(providers),
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
        .map(|providers| {
            session
                .primary_model
                .as_deref()
                .map(|model| {
                    model_matches_provider_filters(model, Some(providers), custom_providers)
                })
        })
        .flatten()
        .unwrap_or(true);
    let mut provider_matches = provider_filter.is_none()
        || matching_token_count > 0
        || (matching_token_count == 0 && non_matching_token_count == 0 && session_provider_matches);
    let allow_provider_agnostic_records = provider_filter.is_none()
        || matching_token_count > 0
        || (matching_token_count == 0 && non_matching_token_count == 0 && session_provider_matches);
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

    // Compute dev_time before the main loop consumes filtered_records
    let dev_time = compute_dev_time_from_records(&filtered_records);

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
                        instance_id: session.instance_id.clone(),
                        instance_label: session.instance_label.clone(),
                        instance_root_path: session.instance_root_path.clone(),
                        session_id: session.session_id.clone(),
                        source: session.source.clone(),
                        content: instruction.content.clone(),
                    });
                }
            }
            NormalizedRecord::Token(token) => {
                if let Some(providers) = provider_filter.as_deref() {
                    if !model_matches_provider_filters(&token.model, Some(providers), custom_providers) {
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

                    let model_tokens =
                        tokens
                            .by_model
                            .entry(token.model.clone())
                            .or_insert(ModelTokens {
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

    let total_tokens = tokens.input + tokens.output + tokens.cache_read + tokens.cache_creation;
    let model = tokens
        .by_model
        .keys()
        .next()
        .cloned()
        .or_else(|| session.primary_model.clone())
        .unwrap_or_else(|| "unknown".to_string());

    Some(SessionAggregate {
        instance_id: session.instance_id.clone(),
        instance_label: session.instance_label.clone(),
        instance_root_path: session.instance_root_path.clone(),
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
        dev_time,
    })
}

/// Compute AI vs user time from a set of normalized records.
///
/// Algorithm:
/// - Each InstructionRecord marks a user action (sending a prompt).
/// - Token/Tool/CodeChange records mark AI activity.
/// - A "turn" starts with an instruction and ends at the last AI event before the next instruction.
/// - AI time = time spanned by turns (instruction_ts → last_ai_event_ts).
/// - User time = gaps between turns (next_instruction_ts − prev_last_ai_event_ts).
fn compute_dev_time_from_records(records: &[&NormalizedRecord]) -> DevTime {
    // Collect timestamped events: instructions are user events, all others are AI events.
    let mut events: Vec<(DateTime<FixedOffset>, bool)> = Vec::new(); // (timestamp, is_instruction)
    for record in records {
        match record {
            NormalizedRecord::Instruction(_) => events.push((*record.timestamp(), true)),
            NormalizedRecord::Token(_)
            | NormalizedRecord::Tool(_)
            | NormalizedRecord::CodeChange(_) => events.push((*record.timestamp(), false)),
        }
    }

    if events.is_empty() {
        return DevTime::default();
    }

    events.sort_by_key(|(ts, _)| *ts);

    let mut ai_time_ms: i64 = 0;
    let mut user_time_ms: i64 = 0;

    let mut in_turn = false;
    let mut turn_start: Option<DateTime<FixedOffset>> = None;
    let mut last_ai_event: Option<DateTime<FixedOffset>> = None;

    for (ts, is_instruction) in &events {
        if *is_instruction {
            if in_turn {
                // End current turn
                if let (Some(start), Some(end)) = (turn_start, last_ai_event) {
                    let dur = (end - start).num_milliseconds();
                    if dur > 0 {
                        ai_time_ms += dur;
                    }
                }
                // User time = gap from last AI event to this instruction
                if let Some(end) = last_ai_event {
                    let gap = (*ts - end).num_milliseconds();
                    if gap > 0 {
                        user_time_ms += gap;
                    }
                }
            }
            // Start new turn
            in_turn = true;
            turn_start = Some(*ts);
            last_ai_event = None;
        } else {
            // AI event
            last_ai_event = Some(*ts);
            if !in_turn {
                in_turn = true;
                turn_start = Some(*ts);
            }
        }
    }

    // Handle final turn
    if in_turn {
        if let (Some(start), Some(end)) = (turn_start, last_ai_event) {
            let dur = (end - start).num_milliseconds();
            if dur > 0 {
                ai_time_ms += dur;
            }
        }
    }

    let total_ms = (ai_time_ms + user_time_ms).max(0) as u64;
    let ai = ai_time_ms.max(0) as u64;
    let user = user_time_ms.max(0) as u64;
    let ai_ratio = if total_ms > 0 {
        (ai as f64 / total_ms as f64) * 100.0
    } else {
        0.0
    };

    DevTime {
        total_ms,
        ai_time_ms: ai,
        user_time_ms: user,
        ai_ratio,
    }
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
    use crate::models::{DiffContent, DiffLine};
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
            instance_id: "built-in:claude_code".to_string(),
            instance_label: "Default".to_string(),
            instance_root_path: "~/.claude".to_string(),
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
                diff_content: None,
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

        let sessions = aggregate_sessions(&sessions, &range, &None, &[]);
        assert_eq!(sessions.len(), 1);
        let session = &sessions[0];
        assert_eq!(session.input, 10);
        assert_eq!(session.output, 20);
        assert_eq!(session.cache_read, 5);
        assert_eq!(session.cache_creation, 2);
        assert_eq!(session.tokens_by_model.len(), 1);
        let model_tokens = session.tokens_by_model.get("claude-sonnet-4-5").unwrap();
        assert_eq!(model_tokens.input, 10);
        assert_eq!(model_tokens.output, 20);
        assert_eq!(model_tokens.cache_read, 5);
        assert_eq!(model_tokens.cache_creation, 2);
        assert_eq!(model_tokens.cost_usd, 1.25);
    }

    #[test]
    fn provider_filter_includes_code_changes_when_matching_tokens_exist_in_mixed_session() {
        let sessions = vec![NormalizedSession {
            source: "codex".to_string(),
            instance_id: "built-in:codex".to_string(),
            instance_label: "Default".to_string(),
            instance_root_path: "~/.codex".to_string(),
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
                    diff_content: None,
                }),
            ],
        }];
        let range = QueryTimeRange::BuiltIn {
            key: crate::models::BuiltInTimeRangeKey::All,
        };

        // Filter by Anthropic: should include only Anthropic tokens but ALSO code changes + instructions
        let provider = Some(vec!["Anthropic".to_string()]);
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
        let provider = Some(vec!["OpenAI".to_string()]);
        let stats = aggregate_statistics(&sessions, &range, &provider, &[]);
        assert_eq!(stats.sessions, 1);
        assert_eq!(stats.tokens.input, 3); // only OpenAI tokens
        assert_eq!(stats.tokens.output, 4);
        assert_eq!(stats.cost_usd, 0.5);
        assert_eq!(stats.code_changes.total.additions, 10);
        assert_eq!(stats.code_changes.total.deletions, 3);
        assert_eq!(stats.code_changes.total.files, 1);

        let sessions = aggregate_sessions(&sessions, &range, &provider, &[]);
        assert_eq!(sessions.len(), 1);
        let session = &sessions[0];
        assert_eq!(session.input, 3);
        assert_eq!(session.output, 4);
        assert_eq!(session.cache_read, 0);
        assert_eq!(session.cache_creation, 0);
        assert_eq!(session.tokens_by_model.len(), 1);
        let model_tokens = session.tokens_by_model.get("gpt-5.4").unwrap();
        assert_eq!(model_tokens.input, 3);
        assert_eq!(model_tokens.output, 4);
        assert_eq!(model_tokens.cache_read, 0);
        assert_eq!(model_tokens.cache_creation, 0);
        assert_eq!(model_tokens.cost_usd, 0.5);
    }

    #[test]
    fn code_changes_detail_preserves_each_occurrence_and_diff_variant() {
        let sessions = vec![session(vec![
            NormalizedRecord::CodeChange(CodeChangeRecord {
                timestamp: ts("2026-03-10T09:01:00+08:00"),
                file_path: "src/main.rs".to_string(),
                extension: "rs".to_string(),
                additions: 2,
                deletions: 0,
                files: 1,
                diff_content: Some(DiffContent::Created {
                    content: "fn main() {}\nprintln!(\"hi\");".to_string(),
                }),
            }),
            NormalizedRecord::CodeChange(CodeChangeRecord {
                timestamp: ts("2026-03-10T09:03:00+08:00"),
                file_path: "src/main.rs".to_string(),
                extension: "rs".to_string(),
                additions: 1,
                deletions: 1,
                files: 1,
                diff_content: Some(DiffContent::TextPair {
                    old: "old line".to_string(),
                    new: "new line".to_string(),
                }),
            }),
        ])];
        let range = QueryTimeRange::BuiltIn {
            key: crate::models::BuiltInTimeRangeKey::All,
        };

        let details = aggregate_code_changes_detail(&sessions, &range, &None, &[]);
        assert_eq!(details.len(), 2);

        assert_eq!(details[0].file_path, "src/main.rs");
        assert_eq!(details[0].change_type, "edit");
        assert_eq!(details[0].additions, 1);
        assert_eq!(details[0].deletions, 1);
        assert!(matches!(
            details[0].diff_content,
            Some(DiffContent::TextPair { .. })
        ));

        assert_eq!(details[1].file_path, "src/main.rs");
        assert_eq!(details[1].change_type, "create");
        assert_eq!(details[1].additions, 2);
        assert_eq!(details[1].deletions, 0);
        assert!(matches!(
            details[1].diff_content,
            Some(DiffContent::Created { .. })
        ));
    }

    #[test]
    fn code_changes_detail_respects_provider_filter_without_dropping_matching_session_changes() {
        let sessions = vec![NormalizedSession {
            source: "codex".to_string(),
            instance_id: "built-in:codex".to_string(),
            instance_label: "Default".to_string(),
            instance_root_path: "~/.codex".to_string(),
            session_id: "mixed-provider".to_string(),
            project_name: "cc-statistics".to_string(),
            git_branch: Some("main".to_string()),
            primary_model: Some("claude-sonnet-4-5".to_string()),
            provider: None,
            records: vec![
                NormalizedRecord::Token(TokenRecord {
                    timestamp: ts("2026-03-10T09:01:00+08:00"),
                    model: "claude-sonnet-4-5".to_string(),
                    input: 10,
                    output: 20,
                    cache_read: 0,
                    cache_creation: 0,
                    cost_usd: 1.0,
                }),
                NormalizedRecord::CodeChange(CodeChangeRecord {
                    timestamp: ts("2026-03-10T09:03:00+08:00"),
                    file_path: "src/main.rs".to_string(),
                    extension: "rs".to_string(),
                    additions: 10,
                    deletions: 3,
                    files: 1,
                    diff_content: Some(DiffContent::Patch {
                        lines: vec![
                            DiffLine {
                                kind: "remove".to_string(),
                                content: "old".to_string(),
                            },
                            DiffLine {
                                kind: "add".to_string(),
                                content: "new".to_string(),
                            },
                        ],
                    }),
                }),
            ],
        }];
        let range = QueryTimeRange::BuiltIn {
            key: crate::models::BuiltInTimeRangeKey::All,
        };

        let anthropic_details =
            aggregate_code_changes_detail(&sessions, &range, &Some(vec!["Anthropic".to_string()]), &[]);
        assert_eq!(anthropic_details.len(), 1);
        assert_eq!(anthropic_details[0].file_path, "src/main.rs");

        let openai_details =
            aggregate_code_changes_detail(&sessions, &range, &Some(vec!["OpenAI".to_string()]), &[]);
        assert!(openai_details.is_empty());
    }

    #[test]
    fn code_changes_detail_hides_summary_only_placeholder_records() {
        let sessions = vec![session(vec![NormalizedRecord::CodeChange(
            CodeChangeRecord {
                timestamp: ts("2026-03-10T09:03:00+08:00"),
                file_path: "session:opaque-summary".to_string(),
                extension: "summary".to_string(),
                additions: 10,
                deletions: 3,
                files: 2,
                diff_content: None,
            },
        )])];
        let range = QueryTimeRange::BuiltIn {
            key: crate::models::BuiltInTimeRangeKey::All,
        };

        let details = aggregate_code_changes_detail(&sessions, &range, &None, &[]);
        assert!(details.is_empty());
    }
}
