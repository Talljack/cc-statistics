use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct ExportRow {
    pub date: String,
    pub project: String,
    pub session_id: String,
    pub model: String,
    pub source: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_creation_tokens: u64,
    pub total_tokens: u64,
    pub cost_usd: f64,
    pub duration_ms: u64,
    pub instructions: u32,
    pub git_branch: String,
}

fn csv_escape(value: &str) -> String {
    if value.contains(',') || value.contains('"') || value.contains('\n') {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}

pub fn format_csv(rows: &[ExportRow]) -> String {
    let header = "date,project,session_id,model,source,input_tokens,output_tokens,cache_read_tokens,cache_creation_tokens,total_tokens,cost_usd,duration_ms,instructions,git_branch";

    let mut lines = vec![header.to_string()];
    for row in rows {
        lines.push(format!(
            "{},{},{},{},{},{},{},{},{},{},{:.6},{},{},{}",
            csv_escape(&row.date),
            csv_escape(&row.project),
            csv_escape(&row.session_id),
            csv_escape(&row.model),
            csv_escape(&row.source),
            row.input_tokens,
            row.output_tokens,
            row.cache_read_tokens,
            row.cache_creation_tokens,
            row.total_tokens,
            row.cost_usd,
            row.duration_ms,
            row.instructions,
            csv_escape(&row.git_branch),
        ));
    }

    lines.join("\n")
}

pub fn format_json(rows: &[ExportRow]) -> String {
    serde_json::to_string_pretty(rows).unwrap_or_else(|_| "[]".to_string())
}

pub fn format_markdown(rows: &[ExportRow], title: &str) -> String {
    let mut out = String::new();

    out.push_str(&format!("# {}\n\n", title));

    // Summary section
    let total_rows = rows.len();
    let total_tokens: u64 = rows.iter().map(|r| r.total_tokens).sum();
    let mut total_cost: f64 = rows.iter().map(|r| r.cost_usd).sum();
    if total_cost.abs() < f64::EPSILON {
        total_cost = 0.0;
    }
    let total_instructions: u32 = rows.iter().map(|r| r.instructions).sum();
    let total_duration_ms: u64 = rows.iter().map(|r| r.duration_ms).sum();

    out.push_str("## Summary\n\n");
    out.push_str(&format!("- **Sessions**: {}\n", total_rows));
    out.push_str(&format!("- **Total Tokens**: {}\n", total_tokens));
    out.push_str(&format!("- **Total Cost (USD)**: ${:.6}\n", total_cost));
    out.push_str(&format!("- **Total Instructions**: {}\n", total_instructions));
    out.push_str(&format!(
        "- **Total Duration**: {} ms\n",
        total_duration_ms
    ));
    out.push('\n');

    // Table
    out.push_str("## Sessions\n\n");
    out.push_str("| Date | Project | Session ID | Model | Source | Input Tokens | Output Tokens | Cache Read | Cache Creation | Total Tokens | Cost (USD) | Duration (ms) | Instructions | Git Branch |\n");
    out.push_str("|------|---------|-----------|-------|--------|-------------|--------------|-----------|---------------|-------------|-----------|--------------|-------------|------------|\n");

    for row in rows {
        out.push_str(&format!(
            "| {} | {} | {} | {} | {} | {} | {} | {} | {} | {} | {:.6} | {} | {} | {} |\n",
            row.date,
            row.project,
            row.session_id,
            row.model,
            row.source,
            row.input_tokens,
            row.output_tokens,
            row.cache_read_tokens,
            row.cache_creation_tokens,
            row.total_tokens,
            row.cost_usd,
            row.duration_ms,
            row.instructions,
            row.git_branch,
        ));
    }

    out
}


#[cfg(test)]
mod tests {
    use super::*;

    fn sample_row() -> ExportRow {
        ExportRow {
            date: "2026-03-29".to_string(),
            project: "cc-statistics".to_string(),
            session_id: "session-abc123".to_string(),
            model: "claude-sonnet-4-5".to_string(),
            source: "claude_code".to_string(),
            input_tokens: 1000,
            output_tokens: 500,
            cache_read_tokens: 200,
            cache_creation_tokens: 100,
            total_tokens: 1800,
            cost_usd: 0.025,
            duration_ms: 60000,
            instructions: 5,
            git_branch: "main".to_string(),
        }
    }

    fn comma_row() -> ExportRow {
        ExportRow {
            date: "2026-03-29".to_string(),
            project: "my,project".to_string(),
            session_id: "session-xyz".to_string(),
            model: "claude,opus".to_string(),
            source: "claude_code".to_string(),
            input_tokens: 10,
            output_tokens: 5,
            cache_read_tokens: 0,
            cache_creation_tokens: 0,
            total_tokens: 15,
            cost_usd: 0.001,
            duration_ms: 1000,
            instructions: 1,
            git_branch: "feature/test".to_string(),
        }
    }

    #[test]
    fn format_csv_empty() {
        let result = format_csv(&[]);
        assert_eq!(
            result,
            "date,project,session_id,model,source,input_tokens,output_tokens,cache_read_tokens,cache_creation_tokens,total_tokens,cost_usd,duration_ms,instructions,git_branch"
        );
    }

    #[test]
    fn format_csv_single_row() {
        let result = format_csv(&[sample_row()]);
        let lines: Vec<&str> = result.lines().collect();
        assert_eq!(lines.len(), 2);
        assert!(lines[0].starts_with("date,project,"));
        assert!(lines[1].contains("2026-03-29"));
        assert!(lines[1].contains("cc-statistics"));
        assert!(lines[1].contains("1800"));
        assert!(lines[1].contains("0.025000"));
    }

    #[test]
    fn format_csv_escapes_commas_in_fields() {
        let result = format_csv(&[comma_row()]);
        let lines: Vec<&str> = result.lines().collect();
        assert_eq!(lines.len(), 2);
        // Fields with commas should be quoted
        assert!(lines[1].contains("\"my,project\""));
        assert!(lines[1].contains("\"claude,opus\""));
    }

    #[test]
    fn format_csv_escapes_quotes_in_fields() {
        let row = ExportRow {
            project: "my \"quoted\" project".to_string(),
            ..sample_row()
        };
        let result = format_csv(&[row]);
        let lines: Vec<&str> = result.lines().collect();
        assert!(lines[1].contains("\"my \"\"quoted\"\" project\""));
    }

    #[test]
    fn format_json_empty() {
        let result = format_json(&[]);
        assert_eq!(result, "[]");
    }

    #[test]
    fn format_json_single_row() {
        let result = format_json(&[sample_row()]);
        assert!(result.starts_with('['));
        assert!(result.ends_with(']'));
        assert!(result.contains("\"date\": \"2026-03-29\""));
        assert!(result.contains("\"project\": \"cc-statistics\""));
        assert!(result.contains("\"total_tokens\": 1800"));
        assert!(result.contains("\"cost_usd\": 0.025"));
    }

    #[test]
    fn format_json_is_pretty_printed() {
        let result = format_json(&[sample_row()]);
        // Pretty-printed JSON has newlines and indentation
        assert!(result.contains('\n'));
        assert!(result.contains("  "));
    }

    #[test]
    fn format_markdown_empty() {
        let result = format_markdown(&[], "My Report");
        assert!(result.starts_with("# My Report"));
        assert!(result.contains("**Sessions**: 0"));
        assert!(result.contains("**Total Tokens**: 0"));
        assert!(result.contains("- **Total Cost (USD)**: $0.000000"));
    }

    #[test]
    fn format_markdown_single_row() {
        let result = format_markdown(&[sample_row()], "Export Report");
        assert!(result.starts_with("# Export Report"));
        assert!(result.contains("**Sessions**: 1"));
        assert!(result.contains("**Total Tokens**: 1800"));
        assert!(result.contains("**Total Instructions**: 5"));
        // Table row
        assert!(result.contains("| 2026-03-29 |"));
        assert!(result.contains("| cc-statistics |"));
        assert!(result.contains("| main |"));
    }

    #[test]
    fn format_markdown_summary_aggregates_multiple_rows() {
        let row1 = sample_row();
        let row2 = ExportRow {
            date: "2026-03-28".to_string(),
            total_tokens: 500,
            cost_usd: 0.010,
            instructions: 2,
            duration_ms: 30000,
            ..sample_row()
        };
        let result = format_markdown(&[row1, row2], "Multi-row Report");
        assert!(result.contains("**Sessions**: 2"));
        assert!(result.contains("**Total Tokens**: 2300"));
        assert!(result.contains("**Total Instructions**: 7"));
    }
}
