export interface PricingCatalogResult {
  providers: PricingProviderCatalog[];
  models: ModelPriceEntry[];
  fetched_at: string;
  expires_at: string;
  stale: boolean;
  errors: string[];
}

export interface PricingProviderCatalog {
  billing_provider: string;
  upstream_provider: string | null;
  source_kind: string;
  source_url: string | null;
  fetched_at: string;
}

export interface ModelPriceEntry {
  billing_provider: string;
  upstream_provider: string | null;
  model_id: string;
  normalized_model_id: string;
  alias_keys: string[];
  input_per_m: number | null;
  output_per_m: number | null;
  cache_read_per_m: number | null;
  cache_write_per_m: number | null;
  source_kind: string;
  source_url: string | null;
  resolved_from: string | null;
  fetched_at: string;
}
