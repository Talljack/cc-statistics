use cc_statistics_lib::commands::{
    get_pricing_catalog, get_pricing_catalog_with_fetcher, refresh_pricing_catalog_with_fetcher,
};
use cc_statistics_lib::models::{ModelPriceEntry, PricingCatalogResult, PricingProviderCatalog};
use cc_statistics_lib::pricing_cache::{
    is_catalog_fresh, load_cached_catalog, merge_provider_refresh, pricing_cache_path,
    save_cached_catalog,
};
use cc_statistics_lib::pricing_providers::{
    alias_keys, app_source_to_billing_provider, billing_provider_coverage,
    billing_provider_fetch_plan, classify_upstream_provider, fetch_billing_provider_entries,
    fetch_upstream_provider_entries, load_or_refresh_catalog_with_fetcher,
    merge_provider_refresh_batches, normalize_model_id, resolve_catalog_entry,
    upstream_provider_coverage, upstream_provider_fetch_plan, CoverageMode, PricingFetchContext,
    ProviderNamespace,
};
use chrono::{Duration, Utc};
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

static ENV_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
static TEST_ID: AtomicU64 = AtomicU64::new(1);

#[test]
fn pricing_catalog_result_serializes_expected_keys() {
    let result = sample_catalog_with_timestamp(
        "2026-03-26T00:00:00Z",
        vec![sample_provider("openrouter", "ok", false, vec![], 1)],
        vec![sample_model(
            "openrouter",
            "anthropic/claude-sonnet-4-5",
            "2026-03-26T00:00:00Z",
        )],
        false,
        vec![],
    );
    let json = serde_json::to_value(result).unwrap();

    assert!(json.get("providers").is_some());
    assert!(json.get("models").is_some());
    assert!(json.get("fetched_at").is_some());
    assert!(json.get("expires_at").is_some());
    assert!(json.get("stale").is_some());
    assert!(json.get("errors").is_some());

    let provider = json
        .get("providers")
        .and_then(|value| value.as_array())
        .and_then(|providers| providers.first())
        .unwrap();
    assert!(provider.get("billing_provider").is_some());
    assert!(provider.get("upstream_provider").is_some());
    assert!(provider.get("status").is_some());
    assert!(provider.get("stale").is_some());
    assert!(provider.get("errors").is_some());
    assert!(provider.get("model_count").is_some());
    assert!(provider.get("source_kind").is_some());
    assert!(provider.get("source_url").is_some());
    assert!(provider.get("fetched_at").is_some());

    let model = json
        .get("models")
        .and_then(|value| value.as_array())
        .and_then(|models| models.first())
        .unwrap();
    assert!(model.get("billing_provider").is_some());
    assert!(model.get("upstream_provider").is_some());
    assert!(model.get("model_id").is_some());
    assert!(model.get("normalized_model_id").is_some());
    assert!(model.get("alias_keys").is_some());
    assert!(model.get("input_per_m").is_some());
    assert!(model.get("output_per_m").is_some());
    assert!(model.get("cache_read_per_m").is_some());
    assert!(model.get("cache_write_per_m").is_some());
    assert!(model.get("source_kind").is_some());
    assert!(model.get("source_url").is_some());
    assert!(model.get("resolved_from").is_some());
    assert!(model.get("fetched_at").is_some());
}

#[test]
fn pricing_catalog_cache_file_path_resolves_to_cc_statistics_pricing_cache_file() {
    let _guard = env_lock().lock().unwrap();
    let temp_home = make_temp_home("cache-path");
    std::env::set_var("CC_STATISTICS_HOME", &temp_home);

    let path = pricing_cache_path().unwrap();

    assert_eq!(
        path,
        temp_home.join(".cc-statistics").join("pricing-cache.json")
    );

    std::env::remove_var("CC_STATISTICS_HOME");
}

#[tokio::test]
async fn pricing_catalog_fresh_cache_is_returned_without_network_fetch() {
    let _guard = env_lock().lock().unwrap();
    let temp_home = make_temp_home("fresh-cache");
    std::env::set_var("CC_STATISTICS_HOME", &temp_home);

    let cache = sample_catalog(false, vec![]);
    save_cached_catalog(&cache).unwrap();

    let fetch_calls = Arc::new(AtomicUsize::new(0));
    let result = load_or_refresh_catalog_with_fetcher(false, {
        let fetch_calls = Arc::clone(&fetch_calls);
        move || {
            let fetch_calls = Arc::clone(&fetch_calls);
            async move {
                fetch_calls.fetch_add(1, Ordering::SeqCst);
                Err("network should not be called".to_string())
            }
        }
    })
    .await
    .unwrap();

    assert_eq!(fetch_calls.load(Ordering::SeqCst), 0);
    assert!(!result.stale);
    assert_eq!(result.models.len(), cache.models.len());

    std::env::remove_var("CC_STATISTICS_HOME");
}

#[tokio::test]
async fn pricing_catalog_stale_cache_triggers_refresh_on_non_forced_reads() {
    let _guard = env_lock().lock().unwrap();
    let temp_home = make_temp_home("stale-non-forced");
    std::env::set_var("CC_STATISTICS_HOME", &temp_home);

    let cache = sample_stale_catalog("openrouter");
    save_cached_catalog(&cache).unwrap();

    let fetch_calls = Arc::new(AtomicUsize::new(0));
    let result = load_or_refresh_catalog_with_fetcher(false, {
        let fetch_calls = Arc::clone(&fetch_calls);
        move || {
            let fetch_calls = Arc::clone(&fetch_calls);
            async move {
                fetch_calls.fetch_add(1, Ordering::SeqCst);
                Ok(vec![sample_model(
                    "openrouter",
                    "openai/gpt-4.1-mini",
                    "2026-03-26T00:00:00Z",
                )])
            }
        }
    })
    .await
    .unwrap();

    assert_eq!(fetch_calls.load(Ordering::SeqCst), 1);
    assert!(!result.stale);
    assert_eq!(result.models.len(), 1);
    assert_eq!(result.models[0].model_id, "openai/gpt-4.1-mini");
    assert_eq!(provider_named(&result, "openrouter").status, "ok");

    std::env::remove_var("CC_STATISTICS_HOME");
}

#[tokio::test]
async fn pricing_catalog_recent_but_stale_merge_triggers_refresh_on_non_forced_reads() {
    let _guard = env_lock().lock().unwrap();
    let temp_home = make_temp_home("recent-stale-merge");
    std::env::set_var("CC_STATISTICS_HOME", &temp_home);

    let previous = sample_catalog_with_timestamp(
        "2026-03-24T00:00:00Z",
        vec![
            sample_provider("openrouter", "ok", false, vec![], 1),
            sample_provider("anthropic", "ok", false, vec![], 1),
        ],
        vec![
            sample_model(
                "openrouter",
                "anthropic/claude-sonnet-4-5",
                "2026-03-24T00:00:00Z",
            ),
            sample_model("anthropic", "claude-opus-4-1", "2026-03-24T00:00:00Z"),
        ],
        false,
        vec![],
    );
    let merged = merge_provider_refresh(
        &previous,
        vec![sample_provider("openrouter", "ok", false, vec![], 1)],
        vec![sample_model(
            "openrouter",
            "openai/gpt-4.1-mini",
            &Utc::now().to_rfc3339(),
        )],
    );
    assert!(merged.stale);
    assert!(merged
        .providers
        .iter()
        .any(|provider| provider.status == "stale"));
    save_cached_catalog(&merged).unwrap();

    let fetch_calls = Arc::new(AtomicUsize::new(0));
    let result = load_or_refresh_catalog_with_fetcher(false, {
        let fetch_calls = Arc::clone(&fetch_calls);
        move || {
            let fetch_calls = Arc::clone(&fetch_calls);
            async move {
                fetch_calls.fetch_add(1, Ordering::SeqCst);
                Ok(vec![sample_model(
                    "openrouter",
                    "openai/gpt-4.1-mini",
                    "2026-03-26T00:00:00Z",
                )])
            }
        }
    })
    .await
    .unwrap();

    assert_eq!(fetch_calls.load(Ordering::SeqCst), 1);
    assert!(result.stale);
    assert_eq!(provider_named(&result, "anthropic").status, "error");
    assert!(result.models.iter().any(|entry| {
        entry.billing_provider == "anthropic" && entry.model_id == "claude-opus-4-1"
    }));

    std::env::remove_var("CC_STATISTICS_HOME");
}

#[tokio::test]
async fn pricing_catalog_stale_cache_survives_refresh_failure() {
    let _guard = env_lock().lock().unwrap();
    let temp_home = make_temp_home("stale-refresh-failure");
    std::env::set_var("CC_STATISTICS_HOME", &temp_home);

    let cache = sample_stale_catalog("openrouter");
    save_cached_catalog(&cache).unwrap();

    let result = load_or_refresh_catalog_with_fetcher(false, || async {
        Err("upstream refresh failed".to_string())
    })
    .await
    .unwrap();

    assert!(result.stale);
    assert_eq!(result.models.len(), cache.models.len());
    let openrouter = provider_named(&result, "openrouter");
    assert_eq!(openrouter.billing_provider, "openrouter");
    assert_eq!(openrouter.status, "error");
    assert_eq!(openrouter.errors, vec!["upstream refresh failed"]);
    assert_eq!(result.errors, vec!["upstream refresh failed"]);

    let persisted = load_cached_catalog().unwrap().unwrap();
    assert_eq!(persisted.models.len(), cache.models.len());
    assert_eq!(provider_named(&persisted, "openrouter").status, "error");
    assert_eq!(
        provider_named(&persisted, "openrouter").errors,
        vec!["upstream refresh failed"]
    );

    std::env::remove_var("CC_STATISTICS_HOME");
}

#[tokio::test]
async fn pricing_catalog_invalid_cache_is_ignored_and_replaced_on_refresh() {
    let _guard = env_lock().lock().unwrap();
    let temp_home = make_temp_home("invalid-cache");
    std::env::set_var("CC_STATISTICS_HOME", &temp_home);

    let cache_path = pricing_cache_path().unwrap();
    fs::create_dir_all(cache_path.parent().unwrap()).unwrap();
    fs::write(&cache_path, "{not valid json").unwrap();

    let result = load_or_refresh_catalog_with_fetcher(false, || async {
        Ok(vec![sample_model(
            "openrouter",
            "openai/gpt-4.1-mini",
            "2026-03-26T00:00:00Z",
        )])
    })
    .await
    .unwrap();

    assert!(result.providers.len() >= 16);
    assert_eq!(provider_named(&result, "openrouter").status, "ok");
    assert_eq!(provider_named(&result, "anthropic").source_kind, "official_doc");
    assert_eq!(provider_named(&result, "cursor").source_kind, "fallback_only");
    assert!(!result.stale);

    let persisted = load_cached_catalog().unwrap().unwrap();
    assert_eq!(provider_named(&persisted, "openrouter").status, "ok");
    assert_eq!(persisted.models[0].model_id, "openai/gpt-4.1-mini");

    std::env::remove_var("CC_STATISTICS_HOME");
}

#[test]
fn pricing_catalog_provider_refresh_status_is_stored_per_billing_provider() {
    let previous = sample_catalog_with_timestamp(
        "2026-03-24T00:00:00Z",
        vec![
            sample_provider("openrouter", "ok", false, vec![], 1),
            sample_provider("anthropic", "ok", false, vec![], 1),
        ],
        vec![
            sample_model(
                "openrouter",
                "anthropic/claude-sonnet-4-5",
                "2026-03-24T00:00:00Z",
            ),
            sample_model("anthropic", "claude-opus-4-1", "2026-03-24T00:00:00Z"),
        ],
        false,
        vec![],
    );

    let merged = merge_provider_refresh(
        &previous,
        vec![
            sample_provider("openrouter", "ok", false, vec![], 1),
            sample_provider(
                "anthropic",
                "error",
                true,
                vec!["doc parse failed".into()],
                1,
            ),
        ],
        vec![sample_model(
            "openrouter",
            "anthropic/claude-sonnet-4-5",
            "2026-03-26T00:00:00Z",
        )],
    );

    let openrouter = merged
        .providers
        .iter()
        .find(|provider| provider.billing_provider == "openrouter")
        .unwrap();
    let anthropic = merged
        .providers
        .iter()
        .find(|provider| provider.billing_provider == "anthropic")
        .unwrap();

    assert_eq!(openrouter.status, "ok");
    assert!(!openrouter.stale);
    assert!(openrouter.errors.is_empty());

    assert_eq!(anthropic.status, "error");
    assert!(anthropic.stale);
    assert_eq!(anthropic.errors, vec!["doc parse failed"]);
}

#[test]
fn pricing_catalog_omitted_provider_is_marked_stale_after_partial_refresh() {
    let previous = sample_catalog_with_timestamp(
        "2026-03-24T00:00:00Z",
        vec![
            sample_provider("openrouter", "ok", false, vec![], 1),
            sample_provider("anthropic", "ok", false, vec![], 1),
        ],
        vec![
            sample_model(
                "openrouter",
                "anthropic/claude-sonnet-4-5",
                "2026-03-24T00:00:00Z",
            ),
            sample_model("anthropic", "claude-opus-4-1", "2026-03-24T00:00:00Z"),
        ],
        false,
        vec![],
    );

    let merged = merge_provider_refresh(
        &previous,
        vec![sample_provider("openrouter", "ok", false, vec![], 1)],
        vec![sample_model(
            "openrouter",
            "openai/gpt-4.1-mini",
            "2026-03-26T00:00:00Z",
        )],
    );

    let anthropic = merged
        .providers
        .iter()
        .find(|provider| provider.billing_provider == "anthropic")
        .unwrap();

    assert_eq!(anthropic.status, "stale");
    assert!(anthropic.stale);
    assert!(merged.stale);
}

#[test]
fn pricing_catalog_successful_refresh_clears_old_catalog_level_errors() {
    let previous = sample_catalog_with_timestamp(
        "2026-03-24T00:00:00Z",
        vec![sample_provider(
            "openrouter",
            "error",
            true,
            vec!["old provider error".into()],
            1,
        )],
        vec![sample_model(
            "openrouter",
            "anthropic/claude-sonnet-4-5",
            "2026-03-24T00:00:00Z",
        )],
        true,
        vec!["old top-level error".into()],
    );

    let merged = merge_provider_refresh(
        &previous,
        vec![sample_provider("openrouter", "ok", false, vec![], 1)],
        vec![sample_model(
            "openrouter",
            "openai/gpt-4.1-mini",
            "2026-03-26T00:00:00Z",
        )],
    );

    assert_eq!(merged.errors, Vec::<String>::new());
    assert!(!merged.stale);
    assert_eq!(merged.providers[0].status, "ok");
    assert!(merged.providers[0].errors.is_empty());
}

#[test]
fn pricing_catalog_one_provider_failure_preserves_only_that_providers_previous_entries() {
    let previous = sample_catalog_with_timestamp(
        "2026-03-24T00:00:00Z",
        vec![
            sample_provider("openrouter", "ok", false, vec![], 1),
            sample_provider("anthropic", "ok", false, vec![], 1),
        ],
        vec![
            sample_model(
                "openrouter",
                "anthropic/claude-sonnet-4-5",
                "2026-03-24T00:00:00Z",
            ),
            sample_model("anthropic", "claude-opus-4-1", "2026-03-24T00:00:00Z"),
        ],
        false,
        vec![],
    );

    let updated_openrouter =
        sample_model("openrouter", "openai/gpt-4.1-mini", "2026-03-26T00:00:00Z");
    let merged = merge_provider_refresh(
        &previous,
        vec![
            sample_provider("openrouter", "ok", false, vec![], 1),
            sample_provider("anthropic", "error", true, vec!["timeout".into()], 1),
        ],
        vec![updated_openrouter.clone()],
    );

    let openrouter_models: Vec<_> = merged
        .models
        .iter()
        .filter(|model| model.billing_provider == "openrouter")
        .collect();
    let anthropic_models: Vec<_> = merged
        .models
        .iter()
        .filter(|model| model.billing_provider == "anthropic")
        .collect();

    assert_eq!(openrouter_models.len(), 1);
    assert_eq!(openrouter_models[0].model_id, updated_openrouter.model_id);
    assert_eq!(anthropic_models.len(), 1);
    assert_eq!(anthropic_models[0].model_id, "claude-opus-4-1");
    assert!(merged.stale);
}

#[test]
fn pricing_catalog_canonical_provider_helpers_cover_account_sources() {
    assert_eq!(app_source_to_billing_provider("claude_code"), "anthropic");
    assert_eq!(app_source_to_billing_provider("codex"), "openai");
    assert_eq!(app_source_to_billing_provider("gemini"), "google");
    assert_eq!(app_source_to_billing_provider("kimi_k2"), "moonshot");
    assert_eq!(app_source_to_billing_provider("kimi"), "kimi");
    assert_eq!(app_source_to_billing_provider("openrouter"), "openrouter");
    assert_eq!(app_source_to_billing_provider("cursor"), "cursor");

    assert_eq!(normalize_model_id("OpenRouter/Anthropic/Claude_Sonnet-4.5 [beta]@preview"), "claude-sonnet-4-5");
    assert_eq!(normalize_model_id("anthropic/claude-sonnet-4-5-20260326"), "claude-sonnet-4-5");

    assert_eq!(
        classify_upstream_provider("openrouter/anthropic/claude-sonnet-4-5"),
        Some("anthropic".to_string())
    );
    assert_eq!(
        classify_upstream_provider("gemini-2.5-pro"),
        Some("google".to_string())
    );
    assert_eq!(classify_upstream_provider("ollama/custom-model"), None);
    assert_eq!(classify_upstream_provider("fireworks/custom-model"), None);
    assert!(alias_keys("anthropic/claude-sonnet-4-5")
        .iter()
        .any(|alias| alias == "claude-sonnet-4-5"));
}

#[test]
fn pricing_catalog_resolver_prefers_upstream_official_before_openrouter_for_openrouter_sources() {
    let catalog = sample_catalog_with_timestamp(
        "2026-03-26T00:00:00Z",
        vec![
            sample_provider("anthropic", "ok", false, vec![], 1),
            sample_provider("openrouter", "ok", false, vec![], 1),
        ],
        vec![
            pricing_model(
                "anthropic",
                None,
                "claude-sonnet-4-5",
                "claude-sonnet-4-5",
                vec!["claude-sonnet-4-5"],
                "official_doc",
                Some("anthropic"),
            ),
            pricing_model(
                "openrouter",
                Some("anthropic"),
                "anthropic/claude-sonnet-4-5",
                "claude-sonnet-4-5",
                vec!["claude-sonnet-4-5"],
                "official_api",
                Some("openrouter"),
            ),
        ],
        false,
        vec![],
    );

    let resolved = resolve_catalog_entry("openrouter", "anthropic/claude-sonnet-4-5", &catalog)
        .expect("expected upstream official model to win before openrouter");

    assert_eq!(resolved.billing_provider, "anthropic");
    assert_eq!(resolved.source_kind, "official_doc");
}

#[test]
fn pricing_catalog_resolver_prefers_tool_provider_before_upstream_for_tool_sources() {
    let catalog = sample_catalog_with_timestamp(
        "2026-03-26T00:00:00Z",
        vec![
            sample_provider("cursor", "ok", false, vec![], 1),
            sample_provider("anthropic", "ok", false, vec![], 1),
        ],
        vec![
            pricing_model(
                "cursor",
                Some("anthropic"),
                "cursor/claude-sonnet-4-6",
                "claude-sonnet-4-6",
                vec!["claude-sonnet-4-6"],
                "fallback_only",
                Some("cursor"),
            ),
            pricing_model(
                "anthropic",
                None,
                "claude-sonnet-4-6",
                "claude-sonnet-4-6",
                vec!["claude-sonnet-4-6"],
                "official_doc",
                Some("anthropic"),
            ),
        ],
        false,
        vec![],
    );

    let resolved = resolve_catalog_entry("cursor", "claude-sonnet-4-6", &catalog)
        .expect("expected tool-native provider to win before upstream fallback");

    assert_eq!(resolved.billing_provider, "cursor");
    assert_eq!(resolved.source_kind, "fallback_only");
}

#[test]
fn pricing_catalog_resolver_treats_kimi_as_a_tool_provider_not_openrouter_fallback() {
    let catalog = sample_catalog_with_timestamp(
        "2026-03-26T00:00:00Z",
        vec![
            sample_provider("kimi", "ok", false, vec![], 1),
            sample_provider("moonshot", "ok", false, vec![], 1),
            sample_provider("openrouter", "ok", false, vec![], 1),
        ],
        vec![
            pricing_model(
                "kimi",
                Some("moonshot"),
                "kimi/kimi-k2",
                "kimi-k2",
                vec!["kimi-k2"],
                "fallback_only",
                Some("kimi"),
            ),
            pricing_model(
                "moonshot",
                None,
                "kimi-k2",
                "kimi-k2",
                vec!["kimi-k2"],
                "official_doc",
                Some("moonshot"),
            ),
            pricing_model(
                "openrouter",
                Some("moonshot"),
                "moonshot/kimi-k2",
                "kimi-k2",
                vec!["kimi-k2"],
                "official_api",
                Some("openrouter"),
            ),
        ],
        false,
        vec![],
    );

    let resolved =
        resolve_catalog_entry("kimi", "moonshot/kimi-k2", &catalog).expect("kimi should win");

    assert_eq!(resolved.billing_provider, "kimi");
    assert_eq!(resolved.source_kind, "fallback_only");
}

#[test]
fn pricing_catalog_resolver_matches_normalized_and_alias_ids() {
    let catalog = sample_catalog_with_timestamp(
        "2026-03-26T00:00:00Z",
        vec![sample_provider("openrouter", "ok", false, vec![], 1)],
        vec![pricing_model(
            "openrouter",
            Some("anthropic"),
            "anthropic/claude-sonnet-4-5",
            "claude-sonnet-4-5",
            vec!["claude-sonnet-4-5", "claude-sonnet-4.5-preview"],
            "official_api",
            Some("openrouter"),
        )],
        false,
        vec![],
    );

    let normalized = resolve_catalog_entry("openrouter", "claude-sonnet-4.5", &catalog)
        .expect("normalized id should match");
    let aliased = resolve_catalog_entry("openrouter", "claude-sonnet-4.5-preview", &catalog)
        .expect("alias id should match");

    assert_eq!(normalized.model_id, "anthropic/claude-sonnet-4-5");
    assert_eq!(aliased.model_id, "anthropic/claude-sonnet-4-5");
}

#[test]
fn pricing_catalog_resolver_rejects_ambiguous_substrings() {
    let catalog = sample_catalog_with_timestamp(
        "2026-03-26T00:00:00Z",
        vec![sample_provider("anthropic", "ok", false, vec![], 2)],
        vec![
            pricing_model(
                "anthropic",
                None,
                "claude-sonnet-4-5",
                "claude-sonnet-4-5",
                vec!["claude-sonnet-4-5"],
                "official_doc",
                Some("anthropic"),
            ),
            pricing_model(
                "anthropic",
                None,
                "claude-sonnet-4-6",
                "claude-sonnet-4-6",
                vec!["claude-sonnet-4-6"],
                "official_doc",
                Some("anthropic"),
            ),
        ],
        false,
        vec![],
    );

    assert!(
        resolve_catalog_entry("claude_code", "claude-sonnet-4", &catalog).is_none(),
        "ambiguous substring matches should not guess"
    );
}

#[test]
fn pricing_catalog_fetch_plans_follow_coverage_matrix() {
    let openrouter = billing_provider_fetch_plan("openrouter").expect("openrouter plan");
    assert_eq!(openrouter.namespace, ProviderNamespace::Billing);
    assert_eq!(openrouter.mode, CoverageMode::OfficialApi);
    assert_eq!(openrouter.source_kind, "official_api");
    assert_eq!(
        openrouter.source_url.as_deref(),
        Some("https://openrouter.ai/api/v1/models")
    );

    let anthropic = billing_provider_fetch_plan("anthropic").expect("anthropic plan");
    assert_eq!(anthropic.mode, CoverageMode::OfficialDoc);
    assert_eq!(anthropic.source_kind, "official_doc");
    assert!(anthropic
        .source_url
        .as_deref()
        .is_some_and(|url| url.contains("anthropic.com")));

    let cursor = billing_provider_fetch_plan("cursor").expect("cursor plan");
    assert_eq!(cursor.mode, CoverageMode::FallbackOnly);
    assert_eq!(cursor.source_kind, "fallback_only");
    assert!(cursor.source_url.is_none());

    let deepseek = upstream_provider_fetch_plan("deepseek").expect("deepseek plan");
    assert_eq!(deepseek.namespace, ProviderNamespace::Upstream);
    assert_eq!(deepseek.mode, CoverageMode::OfficialDoc);
    assert_eq!(deepseek.source_kind, "official_doc");
    assert!(deepseek
        .source_url
        .as_deref()
        .is_some_and(|url| url.contains("deepseek")));

    let yi = upstream_provider_fetch_plan("yi").expect("yi plan");
    assert_eq!(yi.mode, CoverageMode::FallbackOnly);
    assert_eq!(yi.source_kind, "fallback_only");
    assert!(yi.source_url.is_none());
}

#[tokio::test]
async fn pricing_catalog_upstream_fetch_scaffolding_uses_the_coverage_matrix() {
    let context = PricingFetchContext {
        fetched_at: "2026-03-26T00:00:00Z".to_string(),
    };

    let deepseek = fetch_upstream_provider_entries("deepseek", &context)
        .await
        .expect("deepseek should resolve through official docs");
    assert_eq!(deepseek.provider.billing_provider, "deepseek");
    assert_eq!(deepseek.provider.upstream_provider.as_deref(), Some("deepseek"));
    assert_eq!(deepseek.provider.source_kind, "official_doc");
    assert!(deepseek.provider.source_url.as_deref().is_some());
    assert!(deepseek.models.is_empty());

    let yi = fetch_upstream_provider_entries("yi", &context)
        .await
        .expect("yi should remain addressable even as fallback-only");
    assert_eq!(yi.provider.billing_provider, "yi");
    assert_eq!(yi.provider.source_kind, "fallback_only");
    assert!(yi.provider.source_url.is_none());
}

#[tokio::test]
async fn pricing_catalog_billing_fetch_scaffolding_uses_the_coverage_matrix() {
    let context = PricingFetchContext {
        fetched_at: "2026-03-26T00:00:00Z".to_string(),
    };

    let anthropic = fetch_billing_provider_entries("anthropic", &context)
        .await
        .expect("anthropic should resolve through official docs");
    assert_eq!(anthropic.provider.billing_provider, "anthropic");
    assert_eq!(anthropic.provider.source_kind, "official_doc");
    assert!(anthropic.provider.source_url.as_deref().is_some());
    assert!(anthropic.models.is_empty());

    let cursor = fetch_billing_provider_entries("cursor", &context)
        .await
        .expect("cursor should remain addressable even as fallback-only");
    assert_eq!(cursor.provider.billing_provider, "cursor");
    assert_eq!(cursor.provider.source_kind, "fallback_only");
    assert!(cursor.provider.source_url.is_none());
}

#[test]
fn pricing_catalog_provider_refresh_batches_merge_by_provider() {
    let previous = sample_catalog_with_timestamp(
        "2026-03-24T00:00:00Z",
        vec![
            sample_provider("anthropic", "ok", false, vec![], 1),
            sample_provider("openrouter", "ok", false, vec![], 1),
        ],
        vec![
            sample_model("anthropic", "claude-sonnet-4-5", "2026-03-24T00:00:00Z"),
            sample_model("openrouter", "openai/gpt-4.1-mini", "2026-03-24T00:00:00Z"),
        ],
        false,
        vec![],
    );

    let merged = merge_provider_refresh_batches(
        Some(&previous),
        vec![
            sample_refresh(
                sample_provider("anthropic", "error", true, vec!["anthropic failed".to_string()], 0),
                vec![],
            ),
            sample_refresh(
                sample_provider("openrouter", "ok", false, vec![], 1),
                vec![sample_model(
                    "openrouter",
                    "anthropic/claude-opus-4-1",
                    "2026-03-26T00:00:00Z",
                )],
            ),
        ],
    );

    assert!(merged.stale);
    assert_eq!(
        merged
            .providers
            .iter()
            .find(|provider| provider.billing_provider == "anthropic")
            .map(|provider| provider.status.as_str()),
        Some("error")
    );
    assert!(merged.models.iter().any(|entry| {
        entry.billing_provider == "anthropic" && entry.model_id == "claude-sonnet-4-5"
    }));
    assert!(merged.models.iter().any(|entry| {
        entry.billing_provider == "openrouter" && entry.model_id == "anthropic/claude-opus-4-1"
    }));
}

#[tokio::test]
async fn pricing_catalog_runtime_refresh_preserves_previous_entries_for_unimplemented_providers() {
    let _guard = env_lock().lock().unwrap();
    let temp_home = make_temp_home("runtime-provider-merge");
    std::env::set_var("CC_STATISTICS_HOME", &temp_home);

    let previous = sample_catalog_with_timestamp(
        "2026-03-24T00:00:00Z",
        vec![
            sample_provider("anthropic", "ok", false, vec![], 1),
            sample_provider("openrouter", "ok", false, vec![], 1),
        ],
        vec![
            sample_model("anthropic", "claude-opus-4-1", "2026-03-24T00:00:00Z"),
            sample_model(
                "openrouter",
                "anthropic/claude-sonnet-4-5",
                "2026-03-24T00:00:00Z",
            ),
        ],
        false,
        vec![],
    );
    save_cached_catalog(&previous).unwrap();

    let result = load_or_refresh_catalog_with_fetcher(true, || async {
        Ok(vec![sample_model(
            "openrouter",
            "openai/gpt-4.1-mini",
            "2026-03-26T00:00:00Z",
        )])
    })
    .await
    .unwrap();

    assert!(result.models.iter().any(|entry| {
        entry.billing_provider == "anthropic" && entry.model_id == "claude-opus-4-1"
    }));
    assert!(result.models.iter().any(|entry| {
        entry.billing_provider == "openrouter" && entry.model_id == "openai/gpt-4.1-mini"
    }));
    assert_eq!(provider_named(&result, "anthropic").status, "error");
    assert_eq!(provider_named(&result, "openrouter").status, "ok");
    assert!(result.stale);

    std::env::remove_var("CC_STATISTICS_HOME");
}

#[tokio::test]
async fn pricing_catalog_commands_return_expected_shape() {
    let _guard = env_lock().lock().unwrap();
    let temp_home = make_temp_home("command-shape");
    std::env::set_var("CC_STATISTICS_HOME", &temp_home);

    let cache = sample_catalog(false, vec![]);
    save_cached_catalog(&cache).unwrap();

    let from_get = get_pricing_catalog(Some(false)).await.unwrap();
    let refresh_calls = Arc::new(AtomicUsize::new(0));
    let from_refresh = refresh_pricing_catalog_with_fetcher({
        let refresh_calls = Arc::clone(&refresh_calls);
        move || {
            let refresh_calls = Arc::clone(&refresh_calls);
            async move {
                refresh_calls.fetch_add(1, Ordering::SeqCst);
                Ok(vec![sample_model(
                    "openrouter",
                    "openai/gpt-4.1-mini",
                    "2026-03-26T00:00:00Z",
                )])
            }
        }
    })
    .await
    .unwrap();

    assert_catalog_shape(&from_get);
    assert_catalog_shape(&from_refresh);
    assert_eq!(refresh_calls.load(Ordering::SeqCst), 1);
    assert_eq!(from_get.models.len(), cache.models.len());
    assert_eq!(from_refresh.models.len(), 1);
    assert_eq!(from_refresh.models[0].model_id, "openai/gpt-4.1-mini");

    std::env::remove_var("CC_STATISTICS_HOME");
}

#[tokio::test]
async fn pricing_catalog_command_helper_respects_force_refresh_flag() {
    let _guard = env_lock().lock().unwrap();
    let temp_home = make_temp_home("command-force-refresh");
    std::env::set_var("CC_STATISTICS_HOME", &temp_home);

    let cache = sample_catalog(false, vec![]);
    save_cached_catalog(&cache).unwrap();

    let refresh_calls = Arc::new(AtomicUsize::new(0));
    let refreshed = get_pricing_catalog_with_fetcher(Some(true), {
        let refresh_calls = Arc::clone(&refresh_calls);
        move || {
            let refresh_calls = Arc::clone(&refresh_calls);
            async move {
                refresh_calls.fetch_add(1, Ordering::SeqCst);
                Ok(vec![sample_model(
                    "openrouter",
                    "openai/gpt-4.1-mini",
                    "2026-03-26T00:00:00Z",
                )])
            }
        }
    })
    .await
    .unwrap();

    assert_eq!(refresh_calls.load(Ordering::SeqCst), 1);
    assert_eq!(refreshed.models[0].model_id, "openai/gpt-4.1-mini");

    std::env::remove_var("CC_STATISTICS_HOME");
}

#[test]
fn pricing_catalog_commands_are_registered_in_tauri_invoke_handler() {
    let lib_rs = include_str!("../src/lib.rs");

    assert!(lib_rs.contains("get_pricing_catalog"));
    assert!(lib_rs.contains("refresh_pricing_catalog"));
}

#[test]
fn pricing_catalog_freshness_uses_a_24_hour_window() {
    let fresh = sample_catalog(false, vec![]);
    let stale = sample_stale_catalog("openrouter");

    assert!(is_catalog_fresh(&fresh, Utc::now()));
    assert!(!is_catalog_fresh(&stale, Utc::now()));
}

#[test]
fn pricing_catalog_billing_provider_matrix_is_complete() {
    let expected = [
        ("anthropic", CoverageMode::OfficialDoc),
        ("openai", CoverageMode::OfficialDoc),
        ("google", CoverageMode::OfficialDoc),
        ("openrouter", CoverageMode::OfficialApi),
        ("copilot", CoverageMode::FallbackOnly),
        ("moonshot", CoverageMode::OfficialDoc),
        ("zai", CoverageMode::OfficialDoc),
        ("warp", CoverageMode::FallbackOnly),
        ("cursor", CoverageMode::FallbackOnly),
        ("kimi", CoverageMode::FallbackOnly),
        ("amp", CoverageMode::FallbackOnly),
        ("factory", CoverageMode::FallbackOnly),
        ("augment", CoverageMode::FallbackOnly),
        ("jetbrains_ai", CoverageMode::FallbackOnly),
        ("ollama_cloud", CoverageMode::OfficialDoc),
        ("kiro", CoverageMode::FallbackOnly),
    ];

    assert_complete_matrix(
        "billing",
        &expected,
        &extract_matrix_entries("BILLING_PROVIDER_COVERAGE"),
    );

    for (provider, mode) in expected {
        assert_eq!(
            billing_provider_coverage(provider),
            Some(mode),
            "billing provider `{provider}` should resolve to {mode:?}"
        );
    }
}

#[test]
fn pricing_catalog_upstream_provider_matrix_is_complete() {
    let expected = [
        ("anthropic", CoverageMode::OfficialDoc),
        ("openai", CoverageMode::OfficialDoc),
        ("google", CoverageMode::OfficialDoc),
        ("deepseek", CoverageMode::OfficialDoc),
        ("moonshot", CoverageMode::OfficialDoc),
        ("zai", CoverageMode::OfficialDoc),
        ("mistral", CoverageMode::OfficialDoc),
        ("meta", CoverageMode::OfficialDoc),
        ("qwen", CoverageMode::OfficialDoc),
        ("xai", CoverageMode::OfficialDoc),
        ("cohere", CoverageMode::OfficialDoc),
        ("yi", CoverageMode::FallbackOnly),
        ("baichuan", CoverageMode::FallbackOnly),
        ("bytedance", CoverageMode::FallbackOnly),
        ("sensetime", CoverageMode::FallbackOnly),
        ("perplexity", CoverageMode::FallbackOnly),
        ("minimax", CoverageMode::FallbackOnly),
        ("ai21", CoverageMode::FallbackOnly),
        ("stepfun", CoverageMode::FallbackOnly),
        ("baidu", CoverageMode::FallbackOnly),
        ("tencent", CoverageMode::FallbackOnly),
        ("iflytek", CoverageMode::FallbackOnly),
        ("internlm", CoverageMode::FallbackOnly),
        ("nvidia", CoverageMode::FallbackOnly),
        ("reka", CoverageMode::FallbackOnly),
        ("nous", CoverageMode::FallbackOnly),
    ];

    assert_complete_matrix(
        "upstream",
        &expected,
        &extract_matrix_entries("UPSTREAM_PROVIDER_COVERAGE"),
    );

    for (provider, mode) in expected {
        assert_eq!(
            upstream_provider_coverage(provider),
            Some(mode),
            "upstream provider `{provider}` should resolve to {mode:?}"
        );
    }
}

#[test]
fn pricing_catalog_missing_coverage_entries_fail_loudly() {
    let expected = [
        ("anthropic", CoverageMode::OfficialDoc),
        ("openrouter", CoverageMode::OfficialApi),
        ("missing-provider", CoverageMode::FallbackOnly),
    ];
    let actual = [
        ("anthropic".to_string(), CoverageMode::OfficialDoc),
        ("openrouter".to_string(), CoverageMode::OfficialApi),
    ];

    let panic = std::panic::catch_unwind(|| assert_complete_matrix("billing", &expected, &actual))
        .expect_err("missing coverage should panic loudly");
    let message = panic_message(panic);

    assert!(message.contains("billing coverage matrix mismatch"));
    assert!(message.contains("missing-provider"));
}

#[test]
fn pricing_catalog_fallback_only_providers_still_remain_addressable_by_the_merged_resolver() {
    for provider in [
        "copilot",
        "warp",
        "cursor",
        "kimi",
        "amp",
        "factory",
        "augment",
        "jetbrains_ai",
        "kiro",
        "yi",
        "baichuan",
        "bytedance",
        "sensetime",
        "perplexity",
        "minimax",
        "ai21",
        "stepfun",
        "baidu",
        "tencent",
        "iflytek",
        "internlm",
        "nvidia",
        "reka",
        "nous",
    ] {
        if billing_provider_coverage(provider).is_some() {
            assert_eq!(
                billing_provider_coverage(provider),
                Some(CoverageMode::FallbackOnly),
                "fallback-only billing provider `{provider}` should still be resolvable"
            );
        } else {
            assert_eq!(
                upstream_provider_coverage(provider),
                Some(CoverageMode::FallbackOnly),
                "fallback-only upstream provider `{provider}` should still be resolvable"
            );
        }
    }
}

fn assert_complete_matrix(
    namespace: &str,
    expected: &[(&str, CoverageMode)],
    actual: &[(String, CoverageMode)],
) {
    let mut missing = Vec::new();
    let mut mismatched = Vec::new();

    for (provider, expected_mode) in expected {
        match actual.iter().find(|(candidate, _)| candidate == provider) {
            Some((_, actual_mode)) if actual_mode == expected_mode => {}
            Some((_, actual_mode)) => mismatched.push(format!(
                "{provider}: expected {expected_mode:?}, got {actual_mode:?}"
            )),
            None => missing.push((*provider).to_string()),
        }
    }

    let extras: Vec<_> = actual
        .iter()
        .filter(|(provider, _)| !expected.iter().any(|(expected_provider, _)| expected_provider == provider))
        .map(|(provider, mode)| format!("{provider}:{mode:?}"))
        .collect();

    assert!(
        missing.is_empty() && mismatched.is_empty() && extras.is_empty(),
        "{namespace} coverage matrix mismatch\nmissing: {}\nmismatched: {}\nextra: {}",
        missing.join(", "),
        mismatched.join(", "),
        extras.join(", ")
    );
}

fn panic_message(panic: Box<dyn std::any::Any + Send>) -> String {
    if let Some(message) = panic.downcast_ref::<String>() {
        return message.clone();
    }

    if let Some(message) = panic.downcast_ref::<&str>() {
        return (*message).to_string();
    }

    "non-string panic payload".to_string()
}

fn extract_matrix_entries(const_name: &str) -> Vec<(String, CoverageMode)> {
    let source = include_str!("../src/pricing_providers.rs");
    let start = source
        .find(&format!("const {const_name}:"))
        .unwrap_or_else(|| panic!("missing {const_name} definition"));
    let block = &source[start..];
    let open = block
        .find("&[")
        .unwrap_or_else(|| panic!("missing opening slice for {const_name}"));
    let close = block[open + 2..]
        .find("];")
        .unwrap_or_else(|| panic!("missing closing slice for {const_name}"));
    let slice = &block[open + 2..open + 2 + close];

    slice
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            if !trimmed.starts_with("(\"") {
                return None;
            }

            let provider_end = trimmed[2..]
                .find('"')
                .unwrap_or_else(|| panic!("invalid provider entry in {const_name}: {trimmed}"));
            let provider = &trimmed[2..2 + provider_end];
            let mode = if trimmed.contains("CoverageMode::OfficialApi") {
                CoverageMode::OfficialApi
            } else if trimmed.contains("CoverageMode::OfficialDoc") {
                CoverageMode::OfficialDoc
            } else if trimmed.contains("CoverageMode::FallbackOnly") {
                CoverageMode::FallbackOnly
            } else {
                panic!("invalid coverage mode in {const_name}: {trimmed}");
            };

            Some((provider.to_string(), mode))
        })
        .collect()
}

fn assert_catalog_shape(result: &PricingCatalogResult) {
    let json = serde_json::to_value(result).unwrap();

    assert!(json.get("providers").is_some());
    assert!(json.get("models").is_some());
    assert!(json.get("fetched_at").is_some());
    assert!(json.get("expires_at").is_some());
    assert!(json.get("stale").is_some());
    assert!(json.get("errors").is_some());
}

fn sample_catalog(stale: bool, errors: Vec<String>) -> PricingCatalogResult {
    sample_catalog_with_timestamp(
        &Utc::now().to_rfc3339(),
        vec![sample_provider("openrouter", "ok", stale, vec![], 1)],
        vec![sample_model(
            "openrouter",
            "anthropic/claude-sonnet-4-5",
            &Utc::now().to_rfc3339(),
        )],
        stale,
        errors,
    )
}

fn sample_stale_catalog(provider: &str) -> PricingCatalogResult {
    let fetched_at = (Utc::now() - Duration::hours(25)).to_rfc3339();
    sample_catalog_with_timestamp(
        &fetched_at,
        vec![sample_provider(provider, "stale", true, vec![], 1)],
        vec![sample_model(
            provider,
            "anthropic/claude-sonnet-4-5",
            &fetched_at,
        )],
        true,
        vec![],
    )
}

fn sample_catalog_with_timestamp(
    fetched_at: &str,
    providers: Vec<PricingProviderCatalog>,
    models: Vec<ModelPriceEntry>,
    stale: bool,
    errors: Vec<String>,
) -> PricingCatalogResult {
    let expires_at = chrono::DateTime::parse_from_rfc3339(fetched_at)
        .unwrap()
        .with_timezone(&Utc)
        + Duration::hours(24);
    PricingCatalogResult {
        providers,
        models,
        fetched_at: fetched_at.to_string(),
        expires_at: expires_at.to_rfc3339(),
        stale,
        errors,
    }
}

fn provider_named<'a>(
    catalog: &'a PricingCatalogResult,
    billing_provider: &str,
) -> &'a PricingProviderCatalog {
    catalog
        .providers
        .iter()
        .find(|provider| provider.billing_provider == billing_provider)
        .unwrap_or_else(|| panic!("missing provider `{billing_provider}`"))
}

fn sample_provider(
    billing_provider: &str,
    status: &str,
    stale: bool,
    errors: Vec<String>,
    model_count: usize,
) -> PricingProviderCatalog {
    PricingProviderCatalog {
        billing_provider: billing_provider.to_string(),
        upstream_provider: None,
        status: status.to_string(),
        stale,
        errors,
        model_count,
        source_kind: "fixture".to_string(),
        source_url: Some("https://example.com/pricing".to_string()),
        fetched_at: Utc::now().to_rfc3339(),
    }
}

fn sample_model(billing_provider: &str, model_id: &str, fetched_at: &str) -> ModelPriceEntry {
    ModelPriceEntry {
        billing_provider: billing_provider.to_string(),
        upstream_provider: Some(model_id.split('/').next().unwrap_or("unknown").to_string()),
        model_id: model_id.to_string(),
        normalized_model_id: model_id
            .split('/')
            .next_back()
            .unwrap_or(model_id)
            .to_string(),
        alias_keys: vec![model_id
            .split('/')
            .next_back()
            .unwrap_or(model_id)
            .to_string()],
        input_per_m: Some(3.0),
        output_per_m: Some(15.0),
        cache_read_per_m: Some(0.3),
        cache_write_per_m: Some(3.75),
        source_kind: "fixture".to_string(),
        source_url: Some("https://example.com/model".to_string()),
        resolved_from: Some(billing_provider.to_string()),
        fetched_at: fetched_at.to_string(),
    }
}

fn pricing_model(
    billing_provider: &str,
    upstream_provider: Option<&str>,
    model_id: &str,
    normalized_model_id: &str,
    alias_keys: Vec<&str>,
    source_kind: &str,
    resolved_from: Option<&str>,
) -> ModelPriceEntry {
    ModelPriceEntry {
        billing_provider: billing_provider.to_string(),
        upstream_provider: upstream_provider.map(str::to_string),
        model_id: model_id.to_string(),
        normalized_model_id: normalized_model_id.to_string(),
        alias_keys: alias_keys.into_iter().map(str::to_string).collect(),
        input_per_m: Some(3.0),
        output_per_m: Some(15.0),
        cache_read_per_m: Some(0.3),
        cache_write_per_m: Some(3.75),
        source_kind: source_kind.to_string(),
        source_url: Some("https://example.com/model".to_string()),
        resolved_from: resolved_from.map(str::to_string),
        fetched_at: Utc::now().to_rfc3339(),
    }
}

fn sample_refresh(
    provider: PricingProviderCatalog,
    models: Vec<ModelPriceEntry>,
) -> cc_statistics_lib::pricing_providers::ProviderRefreshResult {
    cc_statistics_lib::pricing_providers::ProviderRefreshResult { provider, models }
}

fn env_lock() -> &'static Mutex<()> {
    ENV_LOCK.get_or_init(|| Mutex::new(()))
}

fn make_temp_home(label: &str) -> PathBuf {
    let path = std::env::temp_dir().join(format!(
        "cc-statistics-pricing-catalog-{label}-{}",
        TEST_ID.fetch_add(1, Ordering::SeqCst)
    ));
    let _ = fs::remove_dir_all(&path);
    fs::create_dir_all(&path).unwrap();
    path
}
