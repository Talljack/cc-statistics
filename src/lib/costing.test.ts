import { describe, expect, it } from 'vitest';
import { deriveCostMetrics } from './costing';
import { FALLBACK_PRICING, resolveModelPricing, type PricingContext, type PricingCandidate } from './modelPricing';
import type { ModelPricing } from '../stores/settingsStore';
import type { ModelTokens, SessionInfo } from '../types/statistics';

function modelPricing(
  id: string,
  input: number,
  output: number,
  cacheRead = 0,
  cacheCreation = 0
): PricingCandidate {
  return { id, input, output, cacheRead, cacheCreation };
}

function customPricing(
  input: number,
  output: number,
  cacheRead = 0,
  cacheCreation = 0
): ModelPricing {
  return { input, output, cacheRead, cacheCreation };
}

function tokens(
  input: number,
  output: number,
  cacheRead = 0,
  cacheCreation = 0
): ModelTokens {
  return { input, output, cache_read: cacheRead, cache_creation: cacheCreation, cost_usd: 0 };
}

function session(
  id: string,
  tokensByModel: Record<string, ModelTokens>,
  source = 'claude_code'
): SessionInfo {
  const totalTokens = Object.values(tokensByModel).reduce(
    (sum, bucket) => sum + bucket.input + bucket.output + bucket.cache_read + bucket.cache_creation,
    0
  );

  return {
    session_id: id,
    project_name: 'cc-statistics',
    timestamp: '2026-03-10T09:00:00+08:00',
    duration_ms: 60000,
    duration_formatted: '1m',
    total_tokens: totalTokens,
    instructions: 1,
    model: Object.keys(tokensByModel)[0] || 'unknown',
    git_branch: 'main',
    cost_usd: 0,
    source,
    input: 0,
    output: 0,
    cache_read: 0,
    cache_creation: 0,
    tokens_by_model: tokensByModel,
  };
}

function snapshot(overrides: Partial<PricingContext> = {}): PricingContext {
  return {
    customPricingEnabled: false,
    customPricing: {},
    dynamicPricing: [],
    ...overrides,
  };
}

function sum(values: Record<string, number>): number {
  return Object.values(values).reduce((acc, value) => acc + value, 0);
}

describe('resolveModelPricing', () => {
  it('prefers custom pricing over dynamic pricing', () => {
    const resolved = resolveModelPricing(
      'anthropic/claude-sonnet-4-5',
      snapshot({
        customPricingEnabled: true,
        customPricing: {
          'claude-sonnet-4-5': customPricing(10, 20, 30, 40),
        },
        dynamicPricing: [modelPricing('anthropic/claude-sonnet-4-5', 1, 2, 3, 4)],
      })
    );

    expect(resolved.source).toBe('custom');
    expect(resolved.matchedModel).toBe('claude-sonnet-4-5');
    expect(resolved.input).toBe(10);
    expect(resolved.output).toBe(20);
  });

  it('matches normalized model ids after stripping provider and suffix noise', () => {
    const resolved = resolveModelPricing(
      'anthropic/claude-sonnet-4.5-20241022@thinking [1m]',
      snapshot({
        customPricingEnabled: true,
        customPricing: {
          'claude-sonnet-4-5': customPricing(10, 20, 30, 40),
        },
      })
    );

    expect(resolved.source).toBe('custom');
    expect(resolved.matchedModel).toBe('claude-sonnet-4-5');
    expect(resolved.input).toBe(10);
    expect(resolved.output).toBe(20);
  });

  it('falls back to dynamic pricing before fallback pricing', () => {
    const resolved = resolveModelPricing(
      'anthropic/claude-sonnet-4-6',
      snapshot({
        dynamicPricing: [modelPricing('anthropic/claude-sonnet-4-6', 5, 7, 11, 13)],
      })
    );

    expect(resolved.source).toBe('dynamic');
    expect(resolved.matchedModel).toBe('anthropic/claude-sonnet-4-6');
    expect(resolved.input).toBe(5);
    expect(resolved.output).toBe(7);
    expect(resolved.cacheRead).toBe(11);
    expect(resolved.cacheCreation).toBe(13);
  });

  it('treats unknown sentinels as zero-cost buckets', () => {
    const resolved = resolveModelPricing(
      'unknown',
      snapshot({
        customPricingEnabled: true,
        customPricing: {
          unknown: customPricing(99, 99, 99, 99),
        },
        dynamicPricing: [modelPricing('unknown', 5, 7, 11, 13)],
      })
    );

    expect(resolved.source).toBe('unknown');
    expect(resolved.input).toBe(0);
    expect(resolved.output).toBe(0);
    expect(resolved.cacheRead).toBe(0);
    expect(resolved.cacheCreation).toBe(0);
  });

  it('falls back when substring matching is ambiguous', () => {
    const resolved = resolveModelPricing(
      'sonnet',
      snapshot({
        dynamicPricing: [
          modelPricing('anthropic/claude-sonnet-4-5', 5, 0),
          modelPricing('anthropic/claude-sonnet-4-6', 7, 0),
        ],
      })
    );

    expect(resolved.source).toBe('fallback');
    expect(resolved.matchedModel).toBe(FALLBACK_PRICING.id);
    expect(resolved.input).toBe(FALLBACK_PRICING.input);
  });

  it('accepts a unique substring candidate from dynamic pricing', () => {
    const resolved = resolveModelPricing(
      'sonnet-4-5',
      snapshot({
        dynamicPricing: [
          modelPricing('anthropic/claude-sonnet-4-5', 5, 7),
          modelPricing('openai/gpt-5', 1, 2),
        ],
      })
    );

    expect(resolved.source).toBe('dynamic');
    expect(resolved.matchedModel).toBe('anthropic/claude-sonnet-4-5');
    expect(resolved.input).toBe(5);
    expect(resolved.output).toBe(7);
  });
});

describe('deriveCostMetrics', () => {
  it('excludes cache tokens from cost', () => {
    const result = deriveCostMetrics(
      [
        session('session-cache', {
          'anthropic/claude-sonnet-4-5': tokens(0, 0, 500_000, 250_000),
        }),
      ],
      snapshot({
        dynamicPricing: [modelPricing('anthropic/claude-sonnet-4-5', 3, 15, 30, 40)],
      })
    );

    expect(result.totalCost).toBe(0);
    expect(result.costByType.input).toBe(0);
    expect(result.costByType.output).toBe(0);
    expect(result.costByType.cache_read).toBe(0);
    expect(result.costByType.cache_creation).toBe(0);
    expect(result.costByModel['anthropic/claude-sonnet-4-5']).toBe(0);
  });

  it('keeps total cost equal to model and type breakdown sums', () => {
    const result = deriveCostMetrics(
      [
        session('session-totals', {
          'anthropic/claude-sonnet-4-5': tokens(1_000_000, 0),
          'anthropic/claude-sonnet-4-6': tokens(2_000_000, 1_000_000),
        }),
      ],
      snapshot({
        dynamicPricing: [
          modelPricing('anthropic/claude-sonnet-4-5', 1, 2),
          modelPricing('anthropic/claude-sonnet-4-6', 3, 4),
        ],
      })
    );

    expect(result.totalCost).toBeCloseTo(11);
    expect(sum(result.costByModel)).toBeCloseTo(result.totalCost);
    expect(result.costByType.input + result.costByType.output).toBeCloseTo(result.totalCost);
    expect(result.costByType.cache_read).toBe(0);
    expect(result.costByType.cache_creation).toBe(0);
  });

  it('keeps mixed-model session totals exact', () => {
    const result = deriveCostMetrics(
      [
        session('session-mixed', {
          'anthropic/claude-sonnet-4-5': tokens(1_000_000, 0),
          'anthropic/claude-sonnet-4-6': tokens(0, 1_000_000),
        }),
      ],
      snapshot({
        customPricingEnabled: true,
        customPricing: {
          'claude-sonnet-4-5': customPricing(10, 20),
        },
        dynamicPricing: [modelPricing('anthropic/claude-sonnet-4-6', 30, 40)],
      })
    );

    expect(result.costBySession).toEqual([
      { key: 'claude_code:session-mixed', totalCost: 50 },
    ]);
    expect(result.costByModel['anthropic/claude-sonnet-4-5']).toBeCloseTo(10);
    expect(result.costByModel['anthropic/claude-sonnet-4-6']).toBeCloseTo(40);
    expect(result.totalCost).toBeCloseTo(50);
  });

  it('recomputes all derived outputs when the pricing snapshot changes', () => {
    const sessions = [
      session('session-recompute', {
        'anthropic/claude-sonnet-4-5': tokens(1_000_000, 0),
        'anthropic/claude-sonnet-4-6': tokens(0, 1_000_000),
      }),
    ];

    const first = deriveCostMetrics(
      sessions,
      snapshot({
        customPricingEnabled: true,
        customPricing: {
          'claude-sonnet-4-5': customPricing(1, 2),
          'claude-sonnet-4-6': customPricing(3, 4),
        },
      })
    );

    const second = deriveCostMetrics(
      sessions,
      snapshot({
        customPricingEnabled: true,
        customPricing: {
          'claude-sonnet-4-5': customPricing(10, 20),
          'claude-sonnet-4-6': customPricing(30, 40),
        },
      })
    );

    expect(first.totalCost).toBeCloseTo(5);
    expect(first.costByModel['anthropic/claude-sonnet-4-5']).toBeCloseTo(1);
    expect(first.costByModel['anthropic/claude-sonnet-4-6']).toBeCloseTo(4);
    expect(first.costBySession[0].totalCost).toBeCloseTo(5);

    expect(second.totalCost).toBeCloseTo(50);
    expect(second.costByModel['anthropic/claude-sonnet-4-5']).toBeCloseTo(10);
    expect(second.costByModel['anthropic/claude-sonnet-4-6']).toBeCloseTo(40);
    expect(second.costBySession[0].totalCost).toBeCloseTo(50);
  });

  it('keeps unknown model buckets at zero cost', () => {
    const result = deriveCostMetrics(
      [
        session('session-unknown', {
          unknown: tokens(1_000_000, 1_000_000, 500_000, 500_000),
        }),
      ],
      snapshot({
        customPricingEnabled: true,
        customPricing: {
          unknown: customPricing(100, 200),
        },
        dynamicPricing: [modelPricing('unknown', 10, 20)],
      })
    );

    expect(result.totalCost).toBe(0);
    expect(result.costByModel.unknown).toBe(0);
    expect(result.costByType.input).toBe(0);
    expect(result.costByType.output).toBe(0);
  });
});
