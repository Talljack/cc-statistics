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

import type { CustomPricing, ModelPricing } from '../stores/settingsStore';
import { usePricingStore } from '../stores/pricingStore';
import type { TokenUsage } from '../types/statistics';

/**
 * Get pricing for a model name. Tries dynamic OpenRouter data first,
 * then falls back to hardcoded custom pricing tiers.
 */
function getPricingForModel(model: string, customPricing: CustomPricing): ModelPricing {
  // 1. Try dynamic pricing from OpenRouter cache
  const dynamicEntry = usePricingStore.getState().getPricingForModel(model);
  if (dynamicEntry) {
    return {
      input: dynamicEntry.input,
      output: dynamicEntry.output,
      cacheRead: dynamicEntry.cacheRead,
      cacheCreation: dynamicEntry.cacheWrite,
    };
  }

  // 2. Fallback to hardcoded custom pricing tiers
  const m = model.toLowerCase();
  if (m.includes('opus')) return customPricing.opus;
  if (m.includes('haiku')) return customPricing.haiku;
  if (m.includes('sonnet') || m.includes('claude')) return customPricing.sonnet;
  if (m.includes('o3')) return customPricing.o3;
  if (m.includes('o4-mini') || m.includes('o4_mini')) return customPricing.o4mini;
  if (m.includes('gpt-4.1') || m.includes('gpt-4-1') || m.includes('gpt_4_1')) return customPricing.gpt41;
  if (m.includes('gpt-4o') || m.includes('gpt_4o') || m.includes('gpt4o')) return customPricing.gpt4o;
  if (m.includes('gemini') && m.includes('flash')) return customPricing.gemini25flash;
  if (m.includes('gemini') && m.includes('pro')) return customPricing.gemini25pro;
  if (m.includes('gemini')) return customPricing.gemini25flash;
  if (m.includes('deepseek') && m.includes('r1')) return customPricing.deepseekR1;
  if (m.includes('deepseek')) return customPricing.deepseekV3;
  if (m.includes('kimi') || m.includes('moonshot')) return customPricing.kimiK2;
  if (m.includes('glm')) return customPricing.glm4;
  return customPricing.default;
}

export function calculateCustomCost(
  tokens: TokenUsage,
  customPricing: CustomPricing
): number {
  let total = 0;
  for (const [model, t] of Object.entries(tokens.by_model)) {
    const p = getPricingForModel(model, customPricing);
    const m = 1_000_000;
    total +=
      (t.input / m) * p.input +
      (t.output / m) * p.output +
      (t.cache_read / m) * p.cacheRead +
      (t.cache_creation / m) * p.cacheCreation;
  }
  return total;
}
