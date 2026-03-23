import type { SessionInfo, TokenUsage, ModelTokens } from '../types/statistics';
import { resolveModelPricing, type PricingContext } from './modelPricing';

export interface DerivedCostByType {
  input: number;
  output: number;
  cache_read: number;
  cache_creation: number;
}

export interface DerivedSessionCost {
  key: string;
  totalCost: number;
}

export interface DerivedCostMetrics {
  totalCost: number;
  costByType: DerivedCostByType;
  costByModel: Record<string, number>;
  costBySession: DerivedSessionCost[];
}

export type CostingSnapshot = PricingContext;

interface ModelBucketCost {
  totalCost: number;
  inputCost: number;
  outputCost: number;
}

function createZeroCostByType(): DerivedCostByType {
  return {
    input: 0,
    output: 0,
    cache_read: 0,
    cache_creation: 0,
  };
}

function createZeroBucketCost(): ModelBucketCost {
  return {
    totalCost: 0,
    inputCost: 0,
    outputCost: 0,
  };
}

export function getSessionCostKey(session: Pick<SessionInfo, 'source' | 'session_id'>): string {
  return `${session.source}:${session.session_id}`;
}

function deriveCostFromBuckets(
  modelBuckets: Record<string, ModelTokens>,
  snapshot: CostingSnapshot
): ModelBucketCost {
  const cost = createZeroBucketCost();

  for (const [model, tokens] of Object.entries(modelBuckets)) {
    const pricing = resolveModelPricing(model, snapshot);
    const inputCost = (tokens.input / 1_000_000) * pricing.input;
    const outputCost = (tokens.output / 1_000_000) * pricing.output;

    cost.inputCost += inputCost;
    cost.outputCost += outputCost;
    cost.totalCost += inputCost + outputCost;
  }

  return cost;
}

export function deriveCostFromTokenUsage(tokens: TokenUsage, snapshot: CostingSnapshot): number {
  return deriveCostFromBuckets(tokens.by_model, snapshot).totalCost;
}

export function deriveCostMetrics(
  sessions: readonly SessionInfo[],
  snapshot: CostingSnapshot
): DerivedCostMetrics {
  const total = createZeroCostByType();
  const costByModel: Record<string, number> = {};
  const costBySession: DerivedSessionCost[] = [];
  let totalCost = 0;

  for (const session of sessions) {
    const sessionCost = deriveCostFromBuckets(session.tokens_by_model, snapshot);
    costBySession.push({
      key: getSessionCostKey(session),
      totalCost: sessionCost.totalCost,
    });

    total.input += sessionCost.inputCost;
    total.output += sessionCost.outputCost;
    totalCost += sessionCost.totalCost;

    for (const [model, tokens] of Object.entries(session.tokens_by_model)) {
      const pricing = resolveModelPricing(model, snapshot);
      const modelCost = (tokens.input / 1_000_000) * pricing.input + (tokens.output / 1_000_000) * pricing.output;
      costByModel[model] = (costByModel[model] ?? 0) + modelCost;
    }
  }

  return {
    totalCost,
    costByType: total,
    costByModel,
    costBySession,
  };
}
