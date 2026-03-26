use cc_statistics_lib::commands::{get_pricing_catalog, refresh_pricing_catalog};
use cc_statistics_lib::models::PricingCatalogResult;

#[test]
fn pricing_catalog_result_serializes_expected_keys() {
    let result = PricingCatalogResult {
        providers: vec![],
        models: vec![],
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
