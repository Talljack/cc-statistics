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
}

export interface InstructionInfo {
  timestamp: string;
  project_name: string;
  session_id: string;
  content: string;
}

export interface ProjectInfo {
  name: string;
  path: string;
}

export type TimeFilter = 'today' | 'week' | 'month' | 'all';
