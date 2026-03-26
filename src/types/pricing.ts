export interface PricingCatalogResult {
  providers: PricingProviderCatalog[];
  models: ModelPriceEntry[];
  fetchedAt: string;
  expiresAt: string;
  stale: boolean;
  errors: string[];
}

export interface PricingProviderCatalog {
  billingProvider: string;
  upstreamProvider: string | null;
  sourceKind: string;
  sourceUrl: string | null;
  fetchedAt: string;
}

export interface ModelPriceEntry {
  billingProvider: string;
  upstreamProvider: string | null;
  modelId: string;
  normalizedModelId: string;
  aliasKeys: string[];
  inputPerM: number | null;
  outputPerM: number | null;
  cacheReadPerM: number | null;
  cacheWritePerM: number | null;
  sourceKind: string;
  sourceUrl: string | null;
  resolvedFrom: string | null;
  fetchedAt: string;
}
