use crate::models::*;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;

pub fn parse_session_file(path: &Path) -> Result<SessionStats, String> {
    let file = File::open(path).map_err(|e| format!("Failed to open file: {}", e))?;
    let reader = BufReader::new(file);

    let mut stats = SessionStats::default();

    for line in reader.lines() {
        let line = line.map_err(|e| format!("Failed to read line: {}", e))?;
        if line.trim().is_empty() {
            continue;
        }

        match serde_json::from_str::<JsonlRecord>(&line) {
            Ok(record) => match record {
                JsonlRecord::Assistant(assistant) => {
                    // Extract token usage
                    if let Some(usage) = assistant.message.usage {
                        let input = usage.input.unwrap_or(0);
                        let output = usage.output.unwrap_or(0);
                        let cache_read = usage.cache_read.unwrap_or(0);
                        let cache_creation = usage.cache_creation.unwrap_or(0);

                        stats.tokens.input += input;
                        stats.tokens.output += output;
                        stats.tokens.cache_read += cache_read;
                        stats.tokens.cache_creation += cache_creation;

                        // Track by model
                        if let Some(model) = assistant.message.model {
                            let model_tokens = stats.tokens.by_model.entry(model).or_default();
                            model_tokens.input += input;
                            model_tokens.output += output;
                            model_tokens.cache_read += cache_read;
                            model_tokens.cache_creation += cache_creation;
                        }
                    }

                    // Extract code changes from tool_use
                    if let Some(contents) = assistant.message.content {
                        for content in contents {
                            if let Some(tool_use) = content.tool_use {
                                if let Some(name) = tool_use.name {
                                    if name == "Edit" || name == "Write" {
                                        if let Some(input) = tool_use.input {
                                            let (additions, deletions) =
                                                calculate_code_changes(&name, &input);
                                            stats.code_changes.total.additions += additions;
                                            stats.code_changes.total.deletions += deletions;

                                            // Track by extension
                                            let ext = if let Some(path) = input.file_path {
                                                Path::new(&path)
                                                    .extension()
                                                    .and_then(|s| s.to_str())
                                                    .unwrap_or("unknown")
                                                    .to_string()
                                            } else {
                                                "unknown".to_string()
                                            };

                                            let ext_changes = stats
                                                .code_changes
                                                .by_extension
                                                .entry(ext)
                                                .or_default();
                                            ext_changes.additions += additions;
                                            ext_changes.deletions += deletions;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                JsonlRecord::User(_) => {
                    stats.instructions += 1;
                }
                JsonlRecord::System(system) => {
                    if system.subtype.as_deref() == Some("turn_duration") {
                        if let Some(duration) = system.duration_ms {
                            stats.duration_ms += duration;
                        }
                    }
                }
            },
            Err(_) => {
                // Skip malformed lines
            }
        }
    }

    Ok(stats)
}

fn calculate_code_changes(tool_name: &str, input: &ToolInput) -> (u32, u32) {
    match tool_name {
        "Write" => {
            if let Some(content) = &input.content {
                let lines = content.lines().count() as u32;
                (lines, 0)
            } else {
                (0, 0)
            }
        }
        "Edit" => {
            let old_lines = input.old_string.as_ref().map(|s| s.lines().count()).unwrap_or(0) as u32;
            let new_lines = input.new_string.as_ref().map(|s| s.lines().count()).unwrap_or(0) as u32;
            let additions = if new_lines > old_lines {
                new_lines - old_lines
            } else {
                0
            };
            let deletions = if old_lines > new_lines {
                old_lines - new_lines
            } else {
                0
            };
            (additions, deletions)
        }
        _ => (0, 0),
    }
}

#[derive(Debug, Default, Clone)]
pub struct SessionStats {
    pub instructions: u32,
    pub duration_ms: u64,
    pub tokens: TokenUsage,
    pub code_changes: CodeChanges,
}

#[derive(Debug, Default, Clone)]
pub struct ProjectStats {
    pub sessions: u32,
    pub instructions: u32,
    pub duration_ms: u64,
    pub tokens: TokenUsage,
    pub code_changes: CodeChanges,
}

impl ProjectStats {
    /// Merge session stats into project stats
    pub fn merge_session(&mut self, other: SessionStats) {
        self.sessions += 1;
        self.instructions += other.instructions;
        self.duration_ms += other.duration_ms;
        self.tokens.input += other.tokens.input;
        self.tokens.output += other.tokens.output;
        self.tokens.cache_read += other.tokens.cache_read;
        self.tokens.cache_creation += other.tokens.cache_creation;

        // Merge by model tokens
        for (model, other_tokens) in other.tokens.by_model {
            let model_tokens = self.tokens.by_model.entry(model).or_default();
            model_tokens.input += other_tokens.input;
            model_tokens.output += other_tokens.output;
            model_tokens.cache_read += other_tokens.cache_read;
            model_tokens.cache_creation += other_tokens.cache_creation;
        }

        // Merge code changes
        self.code_changes.total.additions += other.code_changes.total.additions;
        self.code_changes.total.deletions += other.code_changes.total.deletions;

        for (ext, changes) in other.code_changes.by_extension {
            let ext_changes = self.code_changes.by_extension.entry(ext).or_default();
            ext_changes.additions += changes.additions;
            ext_changes.deletions += changes.deletions;
        }
    }

    /// Merge another project stats into this one
    pub fn merge(&mut self, other: ProjectStats) {
        self.sessions += 1;
        self.instructions += other.instructions;
        self.duration_ms += other.duration_ms;
        self.tokens.input += other.tokens.input;
        self.tokens.output += other.tokens.output;
        self.tokens.cache_read += other.tokens.cache_read;
        self.tokens.cache_creation += other.tokens.cache_creation;

        // Merge by model tokens
        for (model, other_tokens) in other.tokens.by_model {
            let model_tokens = self.tokens.by_model.entry(model).or_default();
            model_tokens.input += other_tokens.input;
            model_tokens.output += other_tokens.output;
            model_tokens.cache_read += other_tokens.cache_read;
            model_tokens.cache_creation += other_tokens.cache_creation;
        }

        // Merge code changes
        self.code_changes.total.additions += other.code_changes.total.additions;
        self.code_changes.total.deletions += other.code_changes.total.deletions;

        for (ext, changes) in other.code_changes.by_extension {
            let ext_changes = self.code_changes.by_extension.entry(ext).or_default();
            ext_changes.additions += changes.additions;
            ext_changes.deletions += changes.deletions;
        }
    }

    pub fn to_statistics(&self) -> Statistics {
        let _total_tokens = self.tokens.input + self.tokens.output;
        let ai_time_ms = self.duration_ms; // Approximation: all duration is AI time
        let ai_ratio = if self.duration_ms > 0 {
            (ai_time_ms as f64 / self.duration_ms as f64 * 100.0).min(100.0)
        } else {
            0.0
        };

        Statistics {
            sessions: self.sessions,
            instructions: self.instructions,
            duration_ms: self.duration_ms,
            duration_formatted: format_duration(self.duration_ms),
            tokens: self.tokens.clone(),
            code_changes: self.code_changes.clone(),
            dev_time: DevTime {
                total_ms: self.duration_ms,
                ai_time_ms,
                user_time_ms: 0,
                ai_ratio,
            },
        }
    }
}

fn format_duration(ms: u64) -> String {
    let seconds = ms / 1000;
    let minutes = seconds / 60;
    let hours = minutes / 60;

    if hours > 0 {
        let remaining_minutes = minutes % 60;
        format!("{}h {}m", hours, remaining_minutes)
    } else if minutes > 0 {
        let remaining_seconds = seconds % 60;
        format!("{}m {}s", minutes, remaining_seconds)
    } else {
        format!("{}s", seconds)
    }
}
