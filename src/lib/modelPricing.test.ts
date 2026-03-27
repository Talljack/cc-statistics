import { describe, expect, it } from 'vitest';
import { resolveModelPricing, type PricingCandidate, type PricingContext } from './modelPricing';
import type { ModelPricing } from '../stores/settingsStore';

function candidate(
  id: string,
  input: number,
  output: number,
  options: Partial<PricingCandidate> = {}
): PricingCandidate {
  return {
    id,
    input,
    output,
    cacheRead: 0,
    cacheCreation: 0,
    ...options,
  };
}

function customPricing(input: number, output: number): ModelPricing {
  return {
    input,
    output,
    cacheRead: 0,
    cacheCreation: 0,
  };
}

function context(overrides: Partial<PricingContext> = {}): PricingContext {
  return {
    appSource: undefined,
    customPricingEnabled: false,
    customPricing: {},
    dynamicPricing: [],
    ...overrides,
  };
}

describe('resolveModelPricing source-aware resolution', () => {
  it('prefers app_source override before billing provider and plain model keys', () => {
    const resolved = resolveModelPricing(
      'claude-sonnet-4-5',
      context({
        appSource: 'cursor',
        customPricingEnabled: true,
        customPricing: {
          'cursor:claude-sonnet-4-5': customPricing(1, 2),
          'anthropic:claude-sonnet-4-5': customPricing(3, 4),
          'claude-sonnet-4-5': customPricing(5, 6),
        },
      })
    );

    expect(resolved.source).toBe('custom');
    expect(resolved.matchedModel).toBe('cursor:claude-sonnet-4-5');
    expect(resolved.input).toBe(1);
    expect(resolved.output).toBe(2);
  });

  it('prefers billing_provider override before plain model keys', () => {
    const resolved = resolveModelPricing(
      'claude-sonnet-4-5',
      context({
        appSource: 'claude_code',
        customPricingEnabled: true,
        customPricing: {
          'anthropic:claude-sonnet-4-5': customPricing(3, 4),
          'claude-sonnet-4-5': customPricing(5, 6),
        },
      })
    );

    expect(resolved.source).toBe('custom');
    expect(resolved.matchedModel).toBe('anthropic:claude-sonnet-4-5');
    expect(resolved.input).toBe(3);
    expect(resolved.output).toBe(4);
  });

  it('prefers upstream official entries before OpenRouter entries for openrouter sessions', () => {
    const resolved = resolveModelPricing(
      'anthropic/claude-sonnet-4-5',
      context({
        appSource: 'openrouter',
        dynamicPricing: [
          candidate('anthropic/claude-sonnet-4-5', 5, 7, {
            billingProvider: 'openrouter',
            upstreamProvider: 'anthropic',
            sourceKind: 'official_api',
            resolvedFrom: 'openrouter',
          }),
          candidate('claude-sonnet-4-5', 1, 2, {
            billingProvider: 'anthropic',
            sourceKind: 'official_doc',
          }),
        ],
      })
    );

    expect(resolved.source).toBe('dynamic');
    expect(resolved.matchedModel).toBe('anthropic/claude-sonnet-4-5');
    expect(resolved.input).toBe(5);
    expect(resolved.output).toBe(7);
  });

  it('prefers tool pricing before upstream entries for tool sessions', () => {
    const resolved = resolveModelPricing(
      'claude-sonnet-4-6',
      context({
        appSource: 'cursor',
        dynamicPricing: [
          candidate('cursor/claude-sonnet-4-6', 1, 2, {
            billingProvider: 'cursor',
            upstreamProvider: 'anthropic',
            sourceKind: 'fallback_only',
            aliasKeys: ['claude-sonnet-4-6'],
            resolvedFrom: 'cursor',
          }),
          candidate('claude-sonnet-4-6', 3, 4, {
            billingProvider: 'anthropic',
            sourceKind: 'official_doc',
          }),
        ],
      })
    );

    expect(resolved.source).toBe('dynamic');
    expect(resolved.matchedModel).toBe('cursor/claude-sonnet-4-6');
    expect(resolved.input).toBe(1);
    expect(resolved.output).toBe(2);
  });

  it('uses session source to select different dynamic candidates for the same model', () => {
    const catalog = [
      candidate('cursor/claude-sonnet-4-5', 1, 2, {
        billingProvider: 'cursor',
        upstreamProvider: 'anthropic',
        aliasKeys: ['claude-sonnet-4-5'],
        sourceKind: 'fallback_only',
        resolvedFrom: 'cursor',
      }),
      candidate('anthropic/claude-sonnet-4-5', 5, 7, {
        billingProvider: 'openrouter',
        upstreamProvider: 'anthropic',
        sourceKind: 'official_api',
        resolvedFrom: 'openrouter',
      }),
    ];

    const cursorResolved = resolveModelPricing(
      'claude-sonnet-4-5',
      context({
        appSource: 'cursor',
        dynamicPricing: catalog,
      })
    );
    const openrouterResolved = resolveModelPricing(
      'claude-sonnet-4-5',
      context({
        appSource: 'openrouter',
        dynamicPricing: catalog,
      })
    );

    expect(cursorResolved.source).toBe('dynamic');
    expect(cursorResolved.matchedModel).toBe('cursor/claude-sonnet-4-5');
    expect(cursorResolved.input).toBe(1);
    expect(cursorResolved.output).toBe(2);

    expect(openrouterResolved.source).toBe('dynamic');
    expect(openrouterResolved.matchedModel).toBe('anthropic/claude-sonnet-4-5');
    expect(openrouterResolved.input).toBe(5);
    expect(openrouterResolved.output).toBe(7);
  });

  it('matches alias keys like claude-sonnet-4.5 to claude-sonnet-4-5', () => {
    const resolved = resolveModelPricing(
      'claude-sonnet-4.5',
      context({
        appSource: 'openrouter',
        dynamicPricing: [
          candidate('anthropic/claude-sonnet-4-5', 5, 7, {
            billingProvider: 'openrouter',
            upstreamProvider: 'anthropic',
            aliasKeys: ['claude-sonnet-4-5'],
            sourceKind: 'official_api',
            resolvedFrom: 'openrouter',
          }),
        ],
      })
    );

    expect(resolved.source).toBe('dynamic');
    expect(resolved.matchedModel).toBe('anthropic/claude-sonnet-4-5');
  });

  it('falls through when substring candidates are ambiguous', () => {
    const resolved = resolveModelPricing(
      'claude-sonnet-4',
      context({
        appSource: 'openrouter',
        dynamicPricing: [
          candidate('anthropic/claude-sonnet-4-5', 5, 7, {
            billingProvider: 'anthropic',
            sourceKind: 'official_doc',
          }),
          candidate('anthropic/claude-sonnet-4-6', 6, 8, {
            billingProvider: 'anthropic',
            sourceKind: 'official_doc',
          }),
        ],
      })
    );

    expect(resolved.source).toBe('fallback');
  });
});
