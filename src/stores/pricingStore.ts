import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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

// Sonnet fallback pricing
const FALLBACK: ModelPricingEntry = {
  id: 'fallback',
  name: 'Default (Sonnet)',
  provider: 'anthropic',
  input: 3,
  output: 15,
  cacheRead: 0.30,
  cacheWrite: 3.75,
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

// Fuzzy match: strip provider prefix, version suffixes, brackets
function normalizeModelName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\[.*?\]/g, '')          // [1m] etc
    .replace(/-\d{8}$/, '')           // -20241022
    .replace(/[:@].*$/, '')           // :version or @version
    .trim();
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

        const normalized = normalizeModelName(modelName);

        // 1. Exact id match
        const exact = models.find((m) => m.id === modelName);
        if (exact) return exact;

        // 2. Normalized id match
        const normalizedMatch = models.find(
          (m) => normalizeModelName(m.id) === normalized
        );
        if (normalizedMatch) return normalizedMatch;

        // 3. Best substring match — find the model whose id contains the query
        //    or whose query contains the model's short name
        const candidates = models.filter((m) => {
          const mNorm = normalizeModelName(m.id);
          const mShort = mNorm.split('/').pop() || mNorm;
          return (
            mNorm.includes(normalized) ||
            normalized.includes(mShort) ||
            mShort.includes(normalized)
          );
        });

        if (candidates.length > 0) {
          // Prefer the one with shortest id (most specific match)
          candidates.sort((a, b) => a.id.length - b.id.length);
          return candidates[0];
        }

        return null;
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
