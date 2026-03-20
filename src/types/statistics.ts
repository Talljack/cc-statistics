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
}

export interface ProjectInfo {
  name: string;
  path: string;
}

export type TimeFilter = 'today' | 'week' | 'month' | 'all';
