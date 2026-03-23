import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { FALLBACK_PRICING as SHARED_FALLBACK_PRICING, resolveModelPricing } from '../lib/modelPricing';

// Per-model pricing data from OpenRouter
export interface ModelPricingEntry {
  id: string;            // e.g. "anthropic/claude-sonnet-4.6"
  name: string;          // e.g. "Claude Sonnet 4.6"
  provider: string;      // e.g. "anthropic"
  input: number;         // USD per million tokens
  output: number;        // USD per million tokens
  cacheRead: number;     // USD per million tokens
  cacheWrite: number;    // USD per million tokens
}

interface PricingStore {
  models: ModelPricingEntry[];
  lastFetched: string | null;  // ISO timestamp
  isFetching: boolean;
  error: string | null;

  fetchPricing: () => Promise<void>;
  getPricingForModel: (modelName: string) => ModelPricingEntry | null;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const OPENROUTER_API = 'https://openrouter.ai/api/v1/models';

const FALLBACK: ModelPricingEntry = {
  id: SHARED_FALLBACK_PRICING.id,
  name: 'Default (Sonnet)',
  provider: 'anthropic',
  input: SHARED_FALLBACK_PRICING.input,
  output: SHARED_FALLBACK_PRICING.output,
  cacheRead: SHARED_FALLBACK_PRICING.cacheRead,
  cacheWrite: SHARED_FALLBACK_PRICING.cacheCreation,
};

function parseOpenRouterResponse(data: OpenRouterModel[]): ModelPricingEntry[] {
  return data
    .filter((m) => {
      const prompt = parseFloat(m.pricing?.prompt || '0');
      const completion = parseFloat(m.pricing?.completion || '0');
      return prompt > 0 || completion > 0; // skip free models
    })
    .map((m) => {
      const perM = 1_000_000;
      const input = parseFloat(m.pricing?.prompt || '0') * perM;
      const output = parseFloat(m.pricing?.completion || '0') * perM;
      const cacheRead = parseFloat(m.pricing?.input_cache_read || '0') * perM;
      const cacheWrite = parseFloat(m.pricing?.input_cache_write || '0') * perM;
      const provider = m.id.split('/')[0] || 'unknown';

      return {
        id: m.id,
        name: m.name || m.id,
        provider,
        input: Math.round(input * 1000) / 1000,
        output: Math.round(output * 1000) / 1000,
        cacheRead: Math.round(cacheRead * 10000) / 10000,
        cacheWrite: Math.round(cacheWrite * 10000) / 10000,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

interface OpenRouterModel {
  id: string;
  name?: string;
  pricing?: {
    prompt?: string;
    completion?: string;
    input_cache_read?: string;
    input_cache_write?: string;
  };
}

export const usePricingStore = create<PricingStore>()(
  persist(
    (set, get) => ({
      models: [],
      lastFetched: null,
      isFetching: false,
      error: null,

      fetchPricing: async () => {
        // Check cache freshness
        const { lastFetched, isFetching } = get();
        if (isFetching) return;
        if (lastFetched) {
          const age = Date.now() - new Date(lastFetched).getTime();
          if (age < CACHE_TTL_MS) return; // cache still fresh
        }

        set({ isFetching: true, error: null });
        try {
          const res = await fetch(OPENROUTER_API);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = await res.json();
          const models = parseOpenRouterResponse(json.data || []);
          set({
            models,
            lastFetched: new Date().toISOString(),
            isFetching: false,
          });
        } catch (err) {
          set({
            isFetching: false,
            error: err instanceof Error ? err.message : 'Failed to fetch pricing',
          });
        }
      },

      getPricingForModel: (modelName: string): ModelPricingEntry | null => {
        const { models } = get();
        if (models.length === 0) return null;
        const resolved = resolveModelPricing(modelName, {
          customPricingEnabled: false,
          customPricing: {},
          dynamicPricing: models.map((model) => ({
            id: model.id,
            input: model.input,
            output: model.output,
            cacheRead: model.cacheRead,
            cacheCreation: model.cacheWrite,
          })),
          fallbackPricing: SHARED_FALLBACK_PRICING,
        });

        if (resolved.source === 'dynamic' && resolved.matchedModel) {
          return models.find((model) => model.id === resolved.matchedModel) ?? null;
        }

        return resolved.source === 'fallback' ? FALLBACK : null;
      },
    }),
    {
      name: 'cc-statistics-pricing-cache',
      partialize: (state) => ({
        models: state.models,
        lastFetched: state.lastFetched,
      }),
    }
  )
);

// Export fallback for use elsewhere
export { FALLBACK as FALLBACK_PRICING };
