import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

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

import type { ModelPricing } from '../stores/settingsStore';
import { usePricingStore } from '../stores/pricingStore';
import type { TokenUsage } from '../types/statistics';

/**
 * Calculate cost using custom per-model pricing overrides.
 * For models without a custom override, tries OpenRouter dynamic pricing.
 */
export function calculateCustomCost(
  tokens: TokenUsage,
  customPricing: Record<string, ModelPricing>
): number {
  let total = 0;
  for (const [model, t] of Object.entries(tokens.by_model)) {
    // 1. Check custom pricing override for this exact model
    let p = customPricing[model];

    // 2. Fallback: try dynamic OpenRouter pricing
    if (!p) {
      const dynamicEntry = usePricingStore.getState().getPricingForModel(model);
      if (dynamicEntry) {
        p = {
          input: dynamicEntry.input,
          output: dynamicEntry.output,
          cacheRead: dynamicEntry.cacheRead,
          cacheCreation: dynamicEntry.cacheWrite,
        };
      }
    }

    // 3. Skip if no pricing found (use backend cost_usd)
    if (!p) continue;

    const m = 1_000_000;
    total +=
      (t.input / m) * p.input +
      (t.output / m) * p.output +
      (t.cache_read / m) * p.cacheRead +
      (t.cache_creation / m) * p.cacheCreation;
  }
  return total;
}
