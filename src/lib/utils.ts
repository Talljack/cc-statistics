import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ModelPricing } from '../stores/settingsStore';
import { usePricingStore } from '../stores/pricingStore';
import { deriveCostFromTokenUsage, type CostingSnapshot } from './costing';
import type { TokenUsage } from '../types/statistics';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(num: number): string {
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(1) + 'M';
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(1) + 'K';
  }
  return num.toString();
}

export function formatTokens(num: number): string {
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(1) + 'M';
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(1) + 'K';
  }
  return num.toLocaleString();
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours}h`;
  }
  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${seconds}s`;
}

export function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatCost(usd: number): string {
  if (usd >= 1000) {
    return `$${(usd / 1000).toFixed(1)}K`;
  }
  if (usd >= 1) {
    return `$${usd.toFixed(2)}`;
  }
  if (usd >= 0.01) {
    return `$${usd.toFixed(3)}`;
  }
  if (usd > 0) {
    return `<$0.01`;
  }
  return '$0.00';
}

/**
 * Compatibility wrapper for legacy callers.
 * Uses the shared pricing resolver and excludes cache token cost.
 */
export function calculateCustomCost(
  tokens: TokenUsage,
  customPricing: Record<string, ModelPricing>
): number {
  const dynamicPricing = usePricingStore.getState().models.map((model) => ({
    id: model.id,
    input: model.input,
    output: model.output,
    cacheRead: model.cacheRead,
    cacheCreation: model.cacheWrite,
  }));

  const snapshot: CostingSnapshot = {
    customPricingEnabled: Object.keys(customPricing).length > 0,
    customPricing,
    dynamicPricing,
  };

  return deriveCostFromTokenUsage(tokens, snapshot);
}
