use crate::models::*;
use crate::parser::{ProjectStats, SessionStats, format_duration};
use crate::commands::{model_to_provider, model_matches_provider, CustomProviderDef};
use chrono::{DateTime, Duration, Local, TimeZone};
use std::collections::HashMap;
use std::path::PathBuf;
use rusqlite::{Connection, OpenFlags};

/// Return the path to the opencode SQLite database.
fn db_path() -> Option<PathBuf> {
    let home = dirs::home_dir()?;
    let path = home.join(".local/share/opencode/opencode.db");
    if path.exists() {
        Some(path)
    } else {
        None
    }
}

/// Open the database in read-only mode. Returns None on any error.
fn open_db() -> Option<Connection> {
    let path = db_path()?;
    Connection::open_with_flags(
        &path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .ok()
}

/// Convert a TimeFilter into a unix-millisecond cutoff. Returns 0 for All (no filtering).
fn time_filter_to_ms(time_filter: &TimeFilter) -> i64 {
    let now = Local::now();
    match time_filter {
        TimeFilter::Today => {
            let today_start = now.date_naive().and_hms_opt(0, 0, 0).unwrap();
            let today_start_local = Local.from_local_datetime(&today_start).unwrap();
            today_start_local.timestamp_millis()
        }
        TimeFilter::Week => (now - Duration::days(7)).timestamp_millis(),
        TimeFilter::Month => (now - Duration::days(30)).timestamp_millis(),
        TimeFilter::Days(d) => (now - Duration::days(*d as i64)).timestamp_millis(),
        TimeFilter::All => 0,
    }
}

/// Derive a project display name from a project row.
/// Uses `name` if non-empty, otherwise extracts the last path component of `worktree`.
fn project_display_name(name: &str, worktree: &str) -> String {
    if !name.is_empty() {
        return name.to_string();
    }
    PathBuf::from(worktree)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string()
}

/// Discover all projects that have at least one session.
/// Returns (project_name, project_path/worktree) pairs.
pub fn discover_projects() -> Vec<(String, String)> {
    let conn = match open_db() {
        Some(c) => c,
        None => return Vec::new(),
    };

    let mut stmt = match conn.prepare(
        "SELECT p.id, p.name, p.worktree \
         FROM project p \
         WHERE EXISTS (SELECT 1 FROM session s WHERE s.project_id = p.id)",
    ) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };

    let rows = match stmt.query_map([], |row| {
        let _id: String = row.get(0)?;
        let name: String = row.get::<_, Option<String>>(1)?.unwrap_or_default();
        let worktree: String = row.get::<_, Option<String>>(2)?.unwrap_or_default();
        Ok((name, worktree))
    }) {
        Ok(r) => r,
        Err(_) => return Vec::new(),
    };

    let mut results: Vec<(String, String)> = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for row in rows.flatten() {
        let display = project_display_name(&row.0, &row.1);
        let worktree = row.1.clone();
        if seen.insert(display.clone()) {
            results.push((display, worktree));
        }
    }

    results.sort_by(|a, b| a.0.cmp(&b.0));
    results
}

/// Collect aggregate stats across matching sessions.
pub fn collect_stats(
    project: Option<&str>,
    time_filter: &TimeFilter,
    provider_filter: &Option<String>,
    custom_providers: &[CustomProviderDef],
) -> ProjectStats {
    let conn = match open_db() {
        Some(c) => c,
        None => return ProjectStats::default(),
    };

    let cutoff_ms = time_filter_to_ms(time_filter);

    // Resolve project_ids for the selected project name (if any).
    let project_ids = match project {
        Some(name) => resolve_project_ids(&conn, name),
        None => Vec::new(), // empty means "all"
    };

    let sessions = query_sessions(&conn, &project_ids, cutoff_ms);
    let mut stats = ProjectStats::default();

    for sess in &sessions {
        let session_stats = build_session_stats(&conn, sess, cutoff_ms);

        // Provider filter: skip sessions whose models don't match
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

        if session_stats.has_activity {
            stats.merge_session(session_stats);
        }
    }

    stats
}

/// Collect per-session info for the session list view.
pub fn collect_sessions(
    project: Option<&str>,
    time_filter: &TimeFilter,
    provider_filter: &Option<String>,
    custom_providers: &[CustomProviderDef],
) -> Vec<SessionInfo> {
    let conn = match open_db() {
        Some(c) => c,
        None => return Vec::new(),
    };

    let cutoff_ms = time_filter_to_ms(time_filter);

    let project_ids = match project {
        Some(name) => resolve_project_ids(&conn, name),
        None => Vec::new(),
    };

    let sessions = query_sessions(&conn, &project_ids, cutoff_ms);
    let mut results: Vec<SessionInfo> = Vec::new();

    for sess in &sessions {
        let session_stats = build_session_stats(&conn, sess, cutoff_ms);

        if !session_stats.has_activity {
            continue;
        }

        // Provider filter
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

        // Convert time_created ms to a readable timestamp string
        let timestamp = DateTime::from_timestamp_millis(sess.time_created)
            .map(|dt| dt.with_timezone(&Local).to_rfc3339())
            .unwrap_or_default();

        results.push(SessionInfo {
            session_id: sess.id.clone(),
            project_name: sess.project_name.clone(),
            timestamp,
            duration_ms: session_stats.duration_ms,
            duration_formatted: format_duration(session_stats.duration_ms),
            total_tokens,
            instructions: session_stats.instructions,
            model: session_stats
                .primary_model
                .unwrap_or_else(|| "unknown".to_string()),
            git_branch: String::new(),
            cost_usd: session_stats.cost_usd,
            source: "opencode".to_string(),
        });
    }

    results.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    results
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// A lightweight session row from the database.
struct SessionRow {
    id: String,
    project_name: String,
    time_created: i64,
    time_updated: i64,
    summary_additions: u32,
    summary_deletions: u32,
    summary_files: u32,
}

/// Resolve project table IDs whose display name matches the given name.
fn resolve_project_ids(conn: &Connection, name: &str) -> Vec<String> {
    let mut stmt = match conn.prepare(
        "SELECT id, name, worktree FROM project",
    ) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };

    let rows = match stmt.query_map([], |row| {
        let id: String = row.get(0)?;
        let pname: String = row.get::<_, Option<String>>(1)?.unwrap_or_default();
        let worktree: String = row.get::<_, Option<String>>(2)?.unwrap_or_default();
        Ok((id, pname, worktree))
    }) {
        Ok(r) => r,
        Err(_) => return Vec::new(),
    };

    rows.flatten()
        .filter(|(_, pname, worktree)| {
            project_display_name(pname, worktree) == name
        })
        .map(|(id, _, _)| id)
        .collect()
}

/// Query sessions, optionally filtered by project ids and a time cutoff.
fn query_sessions(conn: &Connection, project_ids: &[String], cutoff_ms: i64) -> Vec<SessionRow> {
    let (sql, params): (String, Vec<Box<dyn rusqlite::types::ToSql>>) = if project_ids.is_empty() {
        if cutoff_ms > 0 {
            (
                "SELECT s.id, s.time_created, s.time_updated, \
                        s.summary_additions, s.summary_deletions, s.summary_files, \
                        COALESCE(p.name, ''), COALESCE(p.worktree, '') \
                 FROM session s \
                 LEFT JOIN project p ON p.id = s.project_id \
                 WHERE s.time_created >= ?1"
                    .to_string(),
                vec![Box::new(cutoff_ms)],
            )
        } else {
            (
                "SELECT s.id, s.time_created, s.time_updated, \
                        s.summary_additions, s.summary_deletions, s.summary_files, \
                        COALESCE(p.name, ''), COALESCE(p.worktree, '') \
                 FROM session s \
                 LEFT JOIN project p ON p.id = s.project_id"
                    .to_string(),
                vec![],
            )
        }
    } else {
        // Build IN clause with positional params
        let placeholders: Vec<String> = (0..project_ids.len())
            .map(|i| format!("?{}", i + 1))
            .collect();
        let in_clause = placeholders.join(", ");

        let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = project_ids
            .iter()
            .map(|id| Box::new(id.clone()) as Box<dyn rusqlite::types::ToSql>)
            .collect();

        if cutoff_ms > 0 {
            let next_idx = project_ids.len() + 1;
            let sql = format!(
                "SELECT s.id, s.time_created, s.time_updated, \
                        s.summary_additions, s.summary_deletions, s.summary_files, \
                        COALESCE(p.name, ''), COALESCE(p.worktree, '') \
                 FROM session s \
                 LEFT JOIN project p ON p.id = s.project_id \
                 WHERE s.project_id IN ({}) AND s.time_created >= ?{}",
                in_clause, next_idx
            );
            params.push(Box::new(cutoff_ms));
            (sql, params)
        } else {
            let sql = format!(
                "SELECT s.id, s.time_created, s.time_updated, \
                        s.summary_additions, s.summary_deletions, s.summary_files, \
                        COALESCE(p.name, ''), COALESCE(p.worktree, '') \
                 FROM session s \
                 LEFT JOIN project p ON p.id = s.project_id \
                 WHERE s.project_id IN ({})",
                in_clause
            );
            (sql, params)
        }
    };

    let mut stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    let rows = match stmt.query_map(param_refs.as_slice(), |row| {
        let id: String = row.get(0)?;
        let time_created: i64 = row.get::<_, Option<i64>>(1)?.unwrap_or(0);
        let time_updated: i64 = row.get::<_, Option<i64>>(2)?.unwrap_or(0);
        let summary_additions: i64 = row.get::<_, Option<i64>>(3)?.unwrap_or(0);
        let summary_deletions: i64 = row.get::<_, Option<i64>>(4)?.unwrap_or(0);
        let summary_files: i64 = row.get::<_, Option<i64>>(5)?.unwrap_or(0);
        let pname: String = row.get(6)?;
        let worktree: String = row.get(7)?;
        Ok(SessionRow {
            id,
            project_name: project_display_name(&pname, &worktree),
            time_created,
            time_updated,
            summary_additions: summary_additions.max(0) as u32,
            summary_deletions: summary_deletions.max(0) as u32,
            summary_files: summary_files.max(0) as u32,
        })
    }) {
        Ok(r) => r,
        Err(_) => return Vec::new(),
    };

    rows.flatten().collect()
}

/// Build SessionStats for a single session by reading its messages.
fn build_session_stats(conn: &Connection, sess: &SessionRow, _cutoff_ms: i64) -> SessionStats {
    let mut stats = SessionStats {
        session_id: Some(sess.id.clone()),
        source: "opencode".to_string(),
        ..Default::default()
    };

    // Populate code changes from the session summary
    stats.code_changes.total.additions = sess.summary_additions;
    stats.code_changes.total.deletions = sess.summary_deletions;
    stats.code_changes.total.files = sess.summary_files;

    // Duration from session timestamps
    if sess.time_updated > sess.time_created && sess.time_created > 0 {
        stats.duration_ms = (sess.time_updated - sess.time_created) as u64;
    }

    // Set first_timestamp from session time_created
    if sess.time_created > 0 {
        if let Some(dt) = DateTime::from_timestamp_millis(sess.time_created) {
            stats.first_timestamp = Some(dt.with_timezone(&Local).to_rfc3339());
        }
    }

    // Query messages for this session
    let mut stmt = match conn.prepare(
        "SELECT data FROM message WHERE session_id = ?1 ORDER BY time_created ASC",
    ) {
        Ok(s) => s,
        Err(_) => return stats,
    };

    let rows = match stmt.query_map([&sess.id], |row| {
        let data: String = row.get(0)?;
        Ok(data)
    }) {
        Ok(r) => r,
        Err(_) => return stats,
    };

    for data_str in rows.flatten() {
        let value: serde_json::Value = match serde_json::from_str(&data_str) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let role = value.get("role").and_then(|v| v.as_str()).unwrap_or("");

        match role {
            "user" => {
                stats.instructions += 1;
                stats.has_activity = true;
            }
            "assistant" => {
                parse_assistant_message(&value, &mut stats);
                stats.has_activity = true;
            }
            _ => {}
        }
    }

    stats
}

/// Parse an assistant message JSON and accumulate token/cost stats.
fn parse_assistant_message(value: &serde_json::Value, stats: &mut SessionStats) {
    // Extract model
    let model_id = value
        .get("modelID")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    // Extract tokens
    let tokens_obj = value.get("tokens");
    let input = tokens_obj
        .and_then(|t| t.get("input"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let output_raw = tokens_obj
        .and_then(|t| t.get("output"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let reasoning = tokens_obj
        .and_then(|t| t.get("reasoning"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let output = output_raw + reasoning;

    let cache_obj = tokens_obj.and_then(|t| t.get("cache"));
    let cache_read = cache_obj
        .and_then(|c| c.get("read"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let cache_creation = cache_obj
        .and_then(|c| c.get("write"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0);

    stats.tokens.input += input;
    stats.tokens.output += output;
    stats.tokens.cache_read += cache_read;
    stats.tokens.cache_creation += cache_creation;

    // Cost: use the value from the data directly if > 0
    let cost = value
        .get("cost")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);

    if !model_id.is_empty() {
        let model_tokens = stats
            .tokens
            .by_model
            .entry(model_id.to_string())
            .or_default();
        model_tokens.input += input;
        model_tokens.output += output;
        model_tokens.cache_read += cache_read;
        model_tokens.cache_creation += cache_creation;

        if cost > 0.0 {
            model_tokens.cost_usd += cost;
            stats.cost_usd += cost;
        }

        if stats.primary_model.is_none() {
            stats.primary_model = Some(model_id.to_string());
        }
    } else if cost > 0.0 {
        stats.cost_usd += cost;
    }

    // Duration from time.created / time.completed
    let time_obj = value.get("time");
    let t_created = time_obj
        .and_then(|t| t.get("created"))
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let t_completed = time_obj
        .and_then(|t| t.get("completed"))
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    if t_completed > t_created && t_created > 0 {
        stats.duration_ms += (t_completed - t_created) as u64;
    }
}
