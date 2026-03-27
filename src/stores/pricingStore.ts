import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import { FALLBACK_PRICING as SHARED_FALLBACK_PRICING, resolveModelPricing } from '../lib/modelPricing';
import type { ModelPriceEntry as CatalogModelPriceEntry, PricingCatalogResult, PricingProviderCatalog } from '../types/pricing';

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
  catalog: PricingCatalogResult | null;
  providers: PricingProviderCatalog[];
  models: ModelPricingEntry[];
  lastFetched: string | null;
  expiresAt: string | null;
  stale: boolean;
  isFetching: boolean;
  error: string | null;

  fetchPricing: (forceRefresh?: boolean) => Promise<void>;
  refreshPricing: () => Promise<void>;
  getPricingForModel: (modelName: string) => ModelPricingEntry | null;
}

const FALLBACK: ModelPricingEntry = {
  id: SHARED_FALLBACK_PRICING.id,
  name: 'Default (Sonnet)',
  provider: 'anthropic',
  input: SHARED_FALLBACK_PRICING.input,
  output: SHARED_FALLBACK_PRICING.output,
  cacheRead: SHARED_FALLBACK_PRICING.cacheRead,
  cacheWrite: SHARED_FALLBACK_PRICING.cacheCreation,
};

function mapCatalogModels(models: CatalogModelPriceEntry[]): ModelPricingEntry[] {
  return models
    .filter((model) => model.input_per_m != null || model.output_per_m != null)
    .map((model) => ({
      id: model.model_id,
      name: model.model_id,
      provider: model.billing_provider,
      input: roundPrice(model.input_per_m, 3),
      output: roundPrice(model.output_per_m, 3),
      cacheRead: roundPrice(model.cache_read_per_m, 4),
      cacheWrite: roundPrice(model.cache_write_per_m, 4),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function roundPrice(value: number | null, precision: number): number {
  if (value == null) return 0;
  const base = 10 ** precision;
  return Math.round(value * base) / base;
}

function shouldSkipFetch(state: PricingStore, forceRefresh: boolean) {
  if (forceRefresh || state.isFetching) return true;
  if (state.stale) return false;
  if (!state.expiresAt) return false;
  return Date.now() < new Date(state.expiresAt).getTime();
}

async function fetchCatalog(forceRefresh: boolean): Promise<PricingCatalogResult> {
  if (forceRefresh) {
    return invoke<PricingCatalogResult>('refresh_pricing_catalog');
  }
  return invoke<PricingCatalogResult>('get_pricing_catalog', { forceRefresh: false });
}

export const usePricingStore = create<PricingStore>()(
  persist(
    (set, get) => ({
      catalog: null,
      providers: [],
      models: [],
      lastFetched: null,
      expiresAt: null,
      stale: false,
      isFetching: false,
      error: null,

      fetchPricing: async (forceRefresh = false) => {
        const current = get();
        if (current.isFetching) return;
        if (!forceRefresh && shouldSkipFetch(current, false)) return;

        set({ isFetching: true, error: null });
        try {
          const catalog = await fetchCatalog(forceRefresh);
          const models = mapCatalogModels(catalog.models);
          set({
            catalog,
            providers: catalog.providers,
            models,
            lastFetched: catalog.fetched_at,
            expiresAt: catalog.expires_at,
            stale: catalog.stale,
            isFetching: false,
            error: catalog.errors[0] ?? null,
          });
        } catch (err) {
          set({
            isFetching: false,
            error: err instanceof Error ? err.message : 'Failed to fetch pricing',
          });
        }
      },

      refreshPricing: async () => {
        await get().fetchPricing(true);
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
        catalog: state.catalog,
        providers: state.providers,
        models: state.models,
        lastFetched: state.lastFetched,
        expiresAt: state.expiresAt,
        stale: state.stale,
      }),
    }
  )
);

// Export fallback for use elsewhere
export { FALLBACK as FALLBACK_PRICING };
