use crate::models::{ModelPriceEntry, PricingCatalogResult, PricingProviderCatalog};
use chrono::{DateTime, Duration, Utc};
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;

const CACHE_DIR_NAME: &str = ".cc-statistics";
const CACHE_FILE_NAME: &str = "pricing-cache.json";
const TEST_HOME_OVERRIDE: &str = "CC_STATISTICS_HOME";

pub fn pricing_cache_path() -> Result<PathBuf, String> {
    let home = std::env::var_os(TEST_HOME_OVERRIDE)
        .map(PathBuf::from)
        .or_else(dirs::home_dir)
        .ok_or_else(|| "Cannot find home directory".to_string())?;

    Ok(home.join(CACHE_DIR_NAME).join(CACHE_FILE_NAME))
}

pub fn load_cached_catalog() -> Result<Option<PricingCatalogResult>, String> {
    let path = pricing_cache_path()?;
    if !path.exists() {
        return Ok(None);
    }

    let contents = match fs::read_to_string(&path) {
        Ok(contents) => contents,
        Err(error) => {
            clear_broken_cache_file(&path);
            return Ok({
                eprintln!(
                    "Ignoring unreadable pricing cache {}: {error}",
                    path.display()
                );
                None
            });
        }
    };
    let catalog = match serde_json::from_str::<PricingCatalogResult>(&contents) {
        Ok(catalog) => catalog,
        Err(error) => {
            clear_broken_cache_file(&path);
            return Ok({
                eprintln!("Ignoring invalid pricing cache {}: {error}", path.display());
                None
            });
        }
    };

    Ok(Some(catalog))
}

pub fn save_cached_catalog(catalog: &PricingCatalogResult) -> Result<(), String> {
    let path = pricing_cache_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "Failed to create pricing cache directory {}: {error}",
                parent.display()
            )
        })?;
    }

    let payload = serde_json::to_string_pretty(catalog)
        .map_err(|error| format!("Failed to serialize pricing cache: {error}"))?;
    let temp_path = path.with_extension(format!("{}.tmp", std::process::id()));

    let mut temp_file = File::create(&temp_path).map_err(|error| {
        format!(
            "Failed to create pricing cache temp file {}: {error}",
            temp_path.display()
        )
    })?;
    temp_file.write_all(payload.as_bytes()).map_err(|error| {
        format!(
            "Failed to write pricing cache temp file {}: {error}",
            temp_path.display()
        )
    })?;
    temp_file.sync_all().map_err(|error| {
        format!(
            "Failed to sync pricing cache temp file {}: {error}",
            temp_path.display()
        )
    })?;
    drop(temp_file);

    fs::rename(&temp_path, &path).map_err(|error| {
        let _ = fs::remove_file(&temp_path);
        format!(
            "Failed to replace pricing cache {} with {}: {error}",
            path.display(),
            temp_path.display()
        )
    })
}

pub fn is_catalog_fresh(catalog: &PricingCatalogResult, now: DateTime<Utc>) -> bool {
    DateTime::parse_from_rfc3339(&catalog.fetched_at)
        .map(|fetched_at| now < fetched_at.with_timezone(&Utc) + Duration::hours(24))
        .unwrap_or(false)
}

pub fn merge_provider_refresh(
    previous: &PricingCatalogResult,
    refreshed: Vec<PricingProviderCatalog>,
    refreshed_models: Vec<ModelPriceEntry>,
) -> PricingCatalogResult {
    let previous_providers: HashMap<_, _> = previous
        .providers
        .iter()
        .cloned()
        .map(|provider| (provider.billing_provider.clone(), provider))
        .collect();
    let previous_models = models_by_provider(previous.models.clone());
    let refreshed_models = models_by_provider(refreshed_models);

    let mut provider_order: Vec<String> = previous
        .providers
        .iter()
        .map(|provider| provider.billing_provider.clone())
        .collect();
    for provider in &refreshed {
        if !provider_order.contains(&provider.billing_provider) {
            provider_order.push(provider.billing_provider.clone());
        }
    }

    let refreshed_lookup: HashMap<_, _> = refreshed
        .into_iter()
        .map(|provider| (provider.billing_provider.clone(), provider))
        .collect();

    let mut providers = Vec::with_capacity(provider_order.len());
    let mut models = Vec::new();
    let mut top_level_errors = Vec::new();
    let mut any_stale = false;
    let had_successful_refresh = refreshed_lookup
        .values()
        .any(|provider| provider.status == "ok");

    for billing_provider in provider_order {
        let previous_provider = previous_providers.get(&billing_provider);
        let previous_provider_models = previous_models
            .get(&billing_provider)
            .cloned()
            .unwrap_or_default();

        if let Some(provider) = refreshed_lookup.get(&billing_provider) {
            if provider.status == "ok" {
                let new_models = refreshed_models
                    .get(&billing_provider)
                    .cloned()
                    .unwrap_or_default();
                let mut updated_provider = provider.clone();
                updated_provider.model_count = new_models.len();
                any_stale |= updated_provider.stale;
                top_level_errors.extend(updated_provider.errors.clone());
                models.extend(new_models);
                providers.push(updated_provider);
            } else {
                let mut updated_provider = previous_provider
                    .cloned()
                    .unwrap_or_else(|| provider.clone());
                updated_provider.status = provider.status.clone();
                updated_provider.stale = true;
                updated_provider.errors = provider.errors.clone();
                if provider.source_url.is_some() {
                    updated_provider.source_url = provider.source_url.clone();
                }
                updated_provider.source_kind = provider.source_kind.clone();
                updated_provider.upstream_provider = provider.upstream_provider.clone();
                updated_provider.model_count = previous_provider_models.len();
                any_stale = true;
                top_level_errors.extend(updated_provider.errors.clone());
                models.extend(previous_provider_models);
                providers.push(updated_provider);
            }
        } else if let Some(provider) = previous_provider.cloned() {
            let mut stale_provider = provider;
            stale_provider.status = "stale".to_string();
            stale_provider.stale = true;
            any_stale = true;
            top_level_errors.extend(stale_provider.errors.clone());
            models.extend(previous_provider_models);
            providers.push(stale_provider);
        }
    }

    let last_success = providers
        .iter()
        .filter(|provider| provider.status == "ok")
        .filter_map(|provider| DateTime::parse_from_rfc3339(&provider.fetched_at).ok())
        .map(|date| date.with_timezone(&Utc))
        .max()
        .or_else(|| {
            DateTime::parse_from_rfc3339(&previous.fetched_at)
                .ok()
                .map(|date| date.with_timezone(&Utc))
        })
        .unwrap_or_else(Utc::now);

    if !had_successful_refresh {
        top_level_errors.extend(previous.errors.clone());
    }
    dedupe_errors(&mut top_level_errors);

    PricingCatalogResult {
        providers,
        models,
        fetched_at: last_success.to_rfc3339(),
        expires_at: (last_success + Duration::hours(24)).to_rfc3339(),
        stale: any_stale,
        errors: top_level_errors,
    }
}

fn models_by_provider(models: Vec<ModelPriceEntry>) -> HashMap<String, Vec<ModelPriceEntry>> {
    let mut grouped = HashMap::new();
    for model in models {
        grouped
            .entry(model.billing_provider.clone())
            .or_insert_with(Vec::new)
            .push(model);
    }
    grouped
}

fn dedupe_errors(errors: &mut Vec<String>) {
    let mut seen = HashSet::new();
    errors.retain(|error| seen.insert(error.clone()));
}

fn clear_broken_cache_file(path: &PathBuf) {
    let _ = fs::remove_file(path);
}
