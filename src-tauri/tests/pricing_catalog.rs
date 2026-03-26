use cc_statistics_lib::commands::{get_pricing_catalog, refresh_pricing_catalog};
use cc_statistics_lib::models::{ModelPriceEntry, PricingCatalogResult, PricingProviderCatalog};

#[test]
fn pricing_catalog_result_serializes_expected_keys() {
    let result = PricingCatalogResult {
        providers: vec![PricingProviderCatalog {
            billing_provider: "openrouter".into(),
            upstream_provider: Some("anthropic".into()),
            source_kind: "stub".into(),
            source_url: Some("https://example.com/providers/openrouter".into()),
            fetched_at: "2026-03-26T00:00:00Z".into(),
        }],
        models: vec![ModelPriceEntry {
            billing_provider: "openrouter".into(),
            upstream_provider: Some("anthropic".into()),
            model_id: "openrouter/anthropic/claude-sonnet-4-5".into(),
            normalized_model_id: "claude-sonnet-4-5".into(),
            alias_keys: vec!["claude-sonnet".into(), "sonnet".into()],
            input_per_m: Some(3.0),
            output_per_m: Some(15.0),
            cache_read_per_m: Some(0.3),
            cache_write_per_m: Some(3.75),
            source_kind: "stub".into(),
            source_url: Some("https://example.com/models/claude-sonnet-4-5".into()),
            resolved_from: Some("openrouter".into()),
            fetched_at: "2026-03-26T00:00:00Z".into(),
        }],
        fetched_at: "2026-03-26T00:00:00Z".into(),
        expires_at: "2026-03-27T00:00:00Z".into(),
        stale: false,
        errors: vec![],
    };
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

#[tokio::test]
async fn pricing_catalog_commands_return_expected_shape() {
    let from_get = get_pricing_catalog(Some(false)).await.unwrap();
    let from_refresh = refresh_pricing_catalog().await.unwrap();

    assert_catalog_shape(&from_get);
    assert_catalog_shape(&from_refresh);
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

#[test]
fn pricing_catalog_commands_are_registered_in_tauri_invoke_handler() {
    let lib_rs = include_str!("../src/lib.rs");

    assert!(lib_rs.contains("get_pricing_catalog"));
    assert!(lib_rs.contains("refresh_pricing_catalog"));
}
