use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToolCallChain {
    Direct,
    Nested,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ToolClassification {
    pub skill_name: Option<String>,
    pub mcp_name: Option<String>,
}

impl ToolClassification {
    pub fn ordinary() -> Self {
        Self {
            skill_name: None,
            mcp_name: None,
        }
    }
}

pub fn classify_tool_call(
    source: &str,
    name: &str,
    input: Option<&Value>,
    call_chain: ToolCallChain,
) -> ToolClassification {
    let mut classification = ToolClassification::ordinary();

    if source == "claude_code" && name == "Skill" {
        classification.skill_name = input
            .and_then(|payload| payload.get("skill"))
            .and_then(|value| value.as_str())
            .map(|value| value.to_string());
    }

    if name.starts_with("mcp__") {
        classification.mcp_name = Some(name.to_string());
    }

    // Conservative default: do not promote non-Claude tool calls to skill
    // unless a source-specific whitelist rule exists and the call is clearly
    // an orchestration-level invocation.
    if classification.skill_name.is_none() && call_chain == ToolCallChain::Nested {
        classification.skill_name = match source {
            "codex" => classify_codex_skill(name, input),
            "gemini" => classify_gemini_skill(name, input),
            "opencode" => classify_opencode_skill(name, input),
            "openclaw" => classify_openclaw_skill(name, input),
            _ => None,
        };
    }

    classification
}

/// Codex skill detection is handled at a higher level via `extract_codex_skill_name_from_payload`
/// in `codex.rs`, which parses `<skill>` XML tags from user message content. This stub is only
/// invoked for nested tool call chains, which Codex does not produce.
fn classify_codex_skill(_name: &str, _input: Option<&Value>) -> Option<String> {
    None
}

/// Gemini does not emit tool call records in its session data, so this classifier is never invoked.
fn classify_gemini_skill(_name: &str, _input: Option<&Value>) -> Option<String> {
    None
}

/// Opencode does not emit tool call records in its session data, so this classifier is never invoked.
fn classify_opencode_skill(_name: &str, _input: Option<&Value>) -> Option<String> {
    None
}

/// Openclaw emits tool records via `toolCall` content blocks, but does not have a dedicated
/// skill invocation pattern. If a skill-like pattern is identified in the future, implement here.
fn classify_openclaw_skill(_name: &str, _input: Option<&Value>) -> Option<String> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn claude_skill_call_extracts_named_skill() {
        let classification = classify_tool_call(
            "claude_code",
            "Skill",
            Some(&json!({ "skill": "brainstorming" })),
            ToolCallChain::Direct,
        );

        assert_eq!(classification.skill_name.as_deref(), Some("brainstorming"));
        assert_eq!(classification.mcp_name, None);
    }

    #[test]
    fn mcp_tool_name_is_classified_as_mcp() {
        let classification = classify_tool_call(
            "claude_code",
            "mcp__filesystem__read_file",
            None,
            ToolCallChain::Direct,
        );

        assert_eq!(
            classification.mcp_name.as_deref(),
            Some("mcp__filesystem__read_file")
        );
        assert_eq!(classification.skill_name, None);
    }

    #[test]
    fn plain_tool_call_is_not_promoted_to_skill() {
        let classification = classify_tool_call("codex", "shell", None, ToolCallChain::Nested);
        assert_eq!(classification, ToolClassification::ordinary());
    }
}
