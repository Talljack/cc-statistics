import { beforeEach, describe, expect, it } from 'vitest';
import { calculateCustomCost } from './utils';
import { usePricingStore } from '../stores/pricingStore';
import type { TokenUsage } from '../types/statistics';

function makeTokens(): TokenUsage {
  return {
    input: 1_000_000,
    output: 0,
    cache_read: 0,
    cache_creation: 0,
    by_model: {
      'anthropic/claude-sonnet-4-5': {
        input: 1_000_000,
        output: 0,
        cache_read: 0,
        cache_creation: 0,
        cost_usd: 0,
      },
    },
  };
}

describe('calculateCustomCost', () => {
  beforeEach(() => {
    usePricingStore.setState({
      catalog: null,
      providers: [],
      models: [
        {
          id: 'cursor/claude-sonnet-4-5',
          name: 'cursor/claude-sonnet-4-5',
          provider: 'cursor',
          input: 1,
          output: 2,
          cacheRead: 0,
          cacheWrite: 0,
          billingProvider: 'cursor',
          upstreamProvider: 'anthropic',
          aliasKeys: ['claude-sonnet-4-5'],
          sourceKind: 'fallback_only',
          resolvedFrom: 'cursor',
        },
        {
          id: 'anthropic/claude-sonnet-4-5',
          name: 'anthropic/claude-sonnet-4-5',
          provider: 'openrouter',
          input: 5,
          output: 7,
          cacheRead: 0,
          cacheWrite: 0,
          billingProvider: 'openrouter',
          upstreamProvider: 'anthropic',
          sourceKind: 'official_api',
          resolvedFrom: 'openrouter',
        },
        {
          id: 'claude-sonnet-4-5',
          name: 'claude-sonnet-4-5',
          provider: 'anthropic',
          input: 3,
          output: 4,
          cacheRead: 0,
          cacheWrite: 0,
          billingProvider: 'anthropic',
          sourceKind: 'official_doc',
        },
      ],
      lastFetched: null,
      expiresAt: null,
      stale: false,
      isFetching: false,
      error: null,
    });
  });

  it('uses appSource when deriving legacy custom cost totals', () => {
    const tokens = makeTokens();

    expect(calculateCustomCost(tokens, {}, 'cursor')).toBeCloseTo(1);
    expect(calculateCustomCost(tokens, {}, 'openrouter')).toBeCloseTo(3);
  });
});
