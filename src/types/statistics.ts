export interface TokenUsage {
  input: number;
  output: number;
  cache_read: number;
  cache_creation: number;
  by_model: Record<string, ModelTokens>;
}

export interface ModelTokens {
  input: number;
  output: number;
  cache_read: number;
  cache_creation: number;
  cost_usd: number;
}

export interface ExtensionChanges {
  additions: number;
  deletions: number;
  files: number;
}

export interface CodeChanges {
  total: ExtensionChanges;
  by_extension: Record<string, ExtensionChanges>;
}

export interface DevTime {
  total_ms: number;
  ai_time_ms: number;
  user_time_ms: number;
  ai_ratio: number;
}

export interface Statistics {
  sessions: number;
  instructions: number;
  duration_ms: number;
  duration_formatted: string;
  tokens: TokenUsage;
  code_changes: CodeChanges;
  dev_time: DevTime;
  tool_usage: Record<string, number>;
  skill_usage: Record<string, number>;
  mcp_usage: Record<string, number>;
  cost_usd: number;
}

export interface SessionInfo {
  session_id: string;
  project_name: string;
  timestamp: string;
  duration_ms: number;
  duration_formatted: string;
  total_tokens: number;
  instructions: number;
  model: string;
  git_branch: string;
  cost_usd: number;
  source: string;
  input: number;
  output: number;
  cache_read: number;
  cache_creation: number;
  tokens_by_model: Record<string, ModelTokens>;
}

export interface InstructionInfo {
  timestamp: string;
  project_name: string;
  session_id: string;
  source: string;
  content: string;
}

export interface ProjectInfo {
  name: string;
  path: string;
}

export interface DiffLine {
  kind: 'add' | 'remove' | 'context';
  content: string;
}

export interface DiffContentPatch {
  type: 'Patch';
  lines: DiffLine[];
}

export interface DiffContentTextPair {
  type: 'TextPair';
  old: string;
  new: string;
}

export interface DiffContentCreated {
  type: 'Created';
  content: string;
}

export type DiffContent = DiffContentPatch | DiffContentTextPair | DiffContentCreated;

export interface FileChange {
  file_path: string;
  extension: string;
  change_type: string;
  additions: number;
  deletions: number;
  diff_content: DiffContent | null;
}

export type TimeFilter = 'today' | 'week' | 'month' | 'all' | string;

export interface SourceConfig {
  claude_code: boolean;
  codex: boolean;
  gemini: boolean;
  opencode: boolean;
  openclaw: boolean;
}
