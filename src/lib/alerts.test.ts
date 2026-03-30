import { describe, expect, it } from 'vitest';
import { checkAlerts, type AlertConfig, type AlertInput } from './alerts';

describe('checkAlerts', () => {
  const baseConfig: AlertConfig = {
    enabled: true,
    dailyCostLimit: 10,
    dailyTokenLimit: 1_000_000,
    sessionWindowWarning: 80,
  };

  it('returns no alerts when under thresholds', () => {
    const input: AlertInput = {
      dailyCost: 5,
      dailyTokens: 500_000,
      sessionUsedPercent: 50,
    };
    const result = checkAlerts(baseConfig, input);
    expect(result.alerts).toHaveLength(0);
  });

  it('fires cost alert when at or over daily limit', () => {
    const input: AlertInput = {
      dailyCost: 10,
      dailyTokens: 500_000,
      sessionUsedPercent: 50,
    };
    const result = checkAlerts(baseConfig, input);
    expect(result.alerts).toContainEqual(expect.objectContaining({ kind: 'cost_limit' }));
  });

  it('fires token alert when at or over daily limit', () => {
    const input: AlertInput = {
      dailyCost: 5,
      dailyTokens: 1_000_000,
      sessionUsedPercent: 50,
    };
    const result = checkAlerts(baseConfig, input);
    expect(result.alerts).toContainEqual(expect.objectContaining({ kind: 'token_limit' }));
  });

  it('fires session window alert when at or over warning threshold', () => {
    const input: AlertInput = {
      dailyCost: 5,
      dailyTokens: 500_000,
      sessionUsedPercent: 80,
    };
    const result = checkAlerts(baseConfig, input);
    expect(result.alerts).toContainEqual(expect.objectContaining({ kind: 'session_window' }));
  });

  it('returns no alerts when disabled', () => {
    const config = { ...baseConfig, enabled: false };
    const input: AlertInput = {
      dailyCost: 999,
      dailyTokens: 999_999_999,
      sessionUsedPercent: 99,
    };
    const result = checkAlerts(config, input);
    expect(result.alerts).toHaveLength(0);
  });

  it('skips checks when limits are zero', () => {
    const config = {
      ...baseConfig,
      dailyCostLimit: 0,
      dailyTokenLimit: 0,
      sessionWindowWarning: 0,
    };
    const input: AlertInput = {
      dailyCost: 999,
      dailyTokens: 999_999_999,
      sessionUsedPercent: 99,
    };
    const result = checkAlerts(config, input);
    expect(result.alerts).toHaveLength(0);
  });
});
