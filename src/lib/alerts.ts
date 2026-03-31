export interface AlertConfig {
  enabled: boolean;
  dailyCostLimit: number;
  dailyTokenLimit: number;
  sessionWindowWarning: number;
}

export interface AlertInput {
  dailyCost: number;
  dailyTokens: number;
  sessionUsedPercent: number;
}

export interface Alert {
  kind: 'cost_limit' | 'token_limit' | 'session_window';
  message: string;
  value: number;
  limit: number;
}

export interface AlertResult {
  alerts: Alert[];
}

export function checkAlerts(config: AlertConfig, input: AlertInput): AlertResult {
  if (!config.enabled) {
    return { alerts: [] };
  }

  const alerts: Alert[] = [];

  if (config.dailyCostLimit > 0 && input.dailyCost >= config.dailyCostLimit) {
    alerts.push({
      kind: 'cost_limit',
      message: `Daily cost $${input.dailyCost.toFixed(2)} reached limit $${config.dailyCostLimit.toFixed(2)}`,
      value: input.dailyCost,
      limit: config.dailyCostLimit,
    });
  }

  if (config.dailyTokenLimit > 0 && input.dailyTokens >= config.dailyTokenLimit) {
    alerts.push({
      kind: 'token_limit',
      message: `Daily tokens ${input.dailyTokens.toLocaleString()} reached limit ${config.dailyTokenLimit.toLocaleString()}`,
      value: input.dailyTokens,
      limit: config.dailyTokenLimit,
    });
  }

  if (config.sessionWindowWarning > 0 && input.sessionUsedPercent >= config.sessionWindowWarning) {
    alerts.push({
      kind: 'session_window',
      message: `Session window ${input.sessionUsedPercent.toFixed(0)}% reached warning threshold ${config.sessionWindowWarning}%`,
      value: input.sessionUsedPercent,
      limit: config.sessionWindowWarning,
    });
  }

  return { alerts };
}
