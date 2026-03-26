use crate::models::{ModelPriceEntry, PricingCatalogResult, PricingProviderCatalog};
use crate::pricing_cache::{
    is_catalog_fresh, load_cached_catalog, merge_provider_refresh, save_cached_catalog,
};
use chrono::{Duration, Utc};
use serde::Deserialize;
use std::future::Future;

const OPENROUTER_CATALOG_URL: &str = "https://openrouter.ai/api/v1/models";
const OPENROUTER_PROVIDER: &str = "openrouter";

#[derive(Debug, Deserialize)]
struct OpenRouterCatalogResponse {
    data: Vec<OpenRouterModel>,
}

#[derive(Debug, Deserialize)]
struct OpenRouterModel {
    id: String,
    #[serde(default)]
    canonical_slug: Option<String>,
    #[serde(default)]
    pricing: OpenRouterPricing,
}

#[derive(Debug, Default, Deserialize)]
struct OpenRouterPricing {
    #[serde(default)]
    prompt: Option<serde_json::Value>,
    #[serde(default)]
    completion: Option<serde_json::Value>,
    #[serde(default)]
    input_cache_read: Option<serde_json::Value>,
    #[serde(default)]
    input_cache_write: Option<serde_json::Value>,
}

pub async fn fetch_openrouter_catalog() -> Result<Vec<ModelPriceEntry>, String> {
    let fetched_at = Utc::now().to_rfc3339();
    let response = reqwest::Client::new()
        .get(OPENROUTER_CATALOG_URL)
        .send()
        .await
        .map_err(|error| format!("OpenRouter catalog request failed: {error}"))?
        .error_for_status()
        .map_err(|error| format!("OpenRouter catalog request failed: {error}"))?;

    let payload = response
        .json::<OpenRouterCatalogResponse>()
        .await
        .map_err(|error| format!("OpenRouter catalog decode failed: {error}"))?;

    Ok(payload
        .data
        .into_iter()
        .map(|model| normalize_openrouter_model(model, &fetched_at))
        .collect())
}

pub async fn get_catalog(force_refresh: bool) -> Result<PricingCatalogResult, String> {
    load_or_refresh_catalog_with_fetcher(force_refresh, fetch_openrouter_catalog).await
}

pub async fn load_or_refresh_catalog_with_fetcher<F, Fut>(
    force_refresh: bool,
    fetcher: F,
) -> Result<PricingCatalogResult, String>
where
    F: Fn() -> Fut,
    Fut: Future<Output = Result<Vec<ModelPriceEntry>, String>>,
{
    let cached = load_cached_catalog()?;

    if let Some(catalog) = cached.clone() {
        if !force_refresh && is_catalog_fresh(&catalog, Utc::now()) {
            return Ok(catalog);
        }
        if !force_refresh {
            let mut stale_catalog = catalog.clone();
            stale_catalog.stale = true;
            stale_catalog.errors.clear();
            for provider in &mut stale_catalog.providers {
                provider.stale = true;
                if provider.status == "ok" {
                    provider.status = "stale".to_string();
                }
                provider.errors.clear();
            }
            return Ok(stale_catalog);
        }
    }

    match fetcher().await {
        Ok(models) => {
            let now = Utc::now();
            let provider = PricingProviderCatalog {
                billing_provider: OPENROUTER_PROVIDER.to_string(),
                upstream_provider: None,
                status: "ok".to_string(),
                stale: false,
                errors: vec![],
                model_count: models.len(),
                source_kind: "official_api".to_string(),
                source_url: Some(OPENROUTER_CATALOG_URL.to_string()),
                fetched_at: now.to_rfc3339(),
            };

            let catalog = if let Some(previous) = cached {
                merge_provider_refresh(&previous, vec![provider], models)
            } else {
                PricingCatalogResult {
                    providers: vec![provider],
                    models,
                    fetched_at: now.to_rfc3339(),
                    expires_at: (now + Duration::hours(24)).to_rfc3339(),
                    stale: false,
                    errors: vec![],
                }
            };

            save_cached_catalog(&catalog)?;
            Ok(catalog)
        }
        Err(error) => {
            if let Some(previous) = cached {
                let fallback = merge_provider_refresh(
                    &previous,
                    vec![PricingProviderCatalog {
                        billing_provider: OPENROUTER_PROVIDER.to_string(),
                        upstream_provider: None,
                        status: "error".to_string(),
                        stale: true,
                        errors: vec![error.clone()],
                        model_count: previous
                            .models
                            .iter()
                            .filter(|model| model.billing_provider == OPENROUTER_PROVIDER)
                            .count(),
                        source_kind: "official_api".to_string(),
                        source_url: Some(OPENROUTER_CATALOG_URL.to_string()),
                        fetched_at: Utc::now().to_rfc3339(),
                    }],
                    vec![],
                );
                return Ok(fallback);
            }

            Err(error)
        }
    }
}

fn normalize_openrouter_model(model: OpenRouterModel, fetched_at: &str) -> ModelPriceEntry {
    let normalized_model_id = model
        .canonical_slug
        .clone()
        .unwrap_or_else(|| {
            model
                .id
                .split('/')
                .next_back()
                .unwrap_or(&model.id)
                .to_string()
        })
        .to_lowercase();
    let upstream_provider = model.id.split('/').next().map(str::to_string);
    let alias_key = normalized_model_id.clone();

    ModelPriceEntry {
        billing_provider: OPENROUTER_PROVIDER.to_string(),
        upstream_provider,
        model_id: model.id,
        normalized_model_id,
        alias_keys: vec![alias_key],
        input_per_m: pricing_to_per_m(model.pricing.prompt),
        output_per_m: pricing_to_per_m(model.pricing.completion),
        cache_read_per_m: pricing_to_per_m(model.pricing.input_cache_read),
        cache_write_per_m: pricing_to_per_m(model.pricing.input_cache_write),
        source_kind: "official_api".to_string(),
        source_url: Some(OPENROUTER_CATALOG_URL.to_string()),
        resolved_from: Some(OPENROUTER_PROVIDER.to_string()),
        fetched_at: fetched_at.to_string(),
    }
}

fn pricing_to_per_m(value: Option<serde_json::Value>) -> Option<f64> {
    let raw = value?;
    match raw {
        serde_json::Value::String(s) => s.parse::<f64>().ok(),
        serde_json::Value::Number(n) => n.as_f64(),
        _ => None,
    }
    .map(|price| price * 1_000_000.0)
}
