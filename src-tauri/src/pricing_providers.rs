use crate::models::{ModelPriceEntry, PricingCatalogResult, PricingProviderCatalog};
use crate::pricing_cache::{
    is_catalog_fresh, load_cached_catalog, merge_provider_refresh, save_cached_catalog,
};
use chrono::{Duration, Utc};
use serde::Deserialize;
use std::collections::HashSet;
use std::future::Future;

const OPENROUTER_CATALOG_URL: &str = "https://openrouter.ai/api/v1/models";
const OPENROUTER_PROVIDER: &str = "openrouter";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CoverageMode {
    OfficialApi,
    OfficialDoc,
    FallbackOnly,
}

const BILLING_PROVIDER_COVERAGE: &[(&str, CoverageMode)] = &[
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

const UPSTREAM_PROVIDER_COVERAGE: &[(&str, CoverageMode)] = &[
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

pub fn billing_provider_coverage(provider: &str) -> Option<CoverageMode> {
    BILLING_PROVIDER_COVERAGE
        .iter()
        .find_map(|(candidate, mode)| (*candidate == provider).then_some(*mode))
}

pub fn upstream_provider_coverage(provider: &str) -> Option<CoverageMode> {
    UPSTREAM_PROVIDER_COVERAGE
        .iter()
        .find_map(|(candidate, mode)| (*candidate == provider).then_some(*mode))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProviderNamespace {
    Billing,
    Upstream,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProviderFetchPlan {
    pub namespace: ProviderNamespace,
    pub provider: String,
    pub mode: CoverageMode,
    pub source_kind: String,
    pub source_url: Option<String>,
}

#[derive(Debug, Clone)]
pub struct PricingFetchContext {
    pub fetched_at: String,
}

impl PricingFetchContext {
    pub fn now() -> Self {
        Self {
            fetched_at: Utc::now().to_rfc3339(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct ProviderRefreshResult {
    pub provider: PricingProviderCatalog,
    pub models: Vec<ModelPriceEntry>,
}

pub fn billing_provider_fetch_plan(provider: &str) -> Option<ProviderFetchPlan> {
    billing_provider_coverage(provider).map(|mode| ProviderFetchPlan {
        namespace: ProviderNamespace::Billing,
        provider: provider.to_string(),
        mode,
        source_kind: coverage_mode_source_kind(mode).to_string(),
        source_url: coverage_source_url(ProviderNamespace::Billing, provider)
            .map(str::to_string),
    })
}

pub fn upstream_provider_fetch_plan(provider: &str) -> Option<ProviderFetchPlan> {
    upstream_provider_coverage(provider).map(|mode| ProviderFetchPlan {
        namespace: ProviderNamespace::Upstream,
        provider: provider.to_string(),
        mode,
        source_kind: coverage_mode_source_kind(mode).to_string(),
        source_url: coverage_source_url(ProviderNamespace::Upstream, provider)
            .map(str::to_string),
    })
}

pub async fn fetch_billing_provider_entries(
    provider: &str,
    ctx: &PricingFetchContext,
) -> Result<ProviderRefreshResult, String> {
    fetch_billing_provider_entries_with_fetcher(provider, ctx, None, &fetch_openrouter_catalog)
        .await
}

async fn fetch_billing_provider_entries_with_fetcher<F, Fut>(
    provider: &str,
    ctx: &PricingFetchContext,
    previous: Option<&PricingCatalogResult>,
    openrouter_fetcher: &F,
) -> Result<ProviderRefreshResult, String>
where
    F: Fn() -> Fut,
    Fut: Future<Output = Result<Vec<ModelPriceEntry>, String>>,
{
    let plan = billing_provider_fetch_plan(provider)
        .ok_or_else(|| format!("Unsupported billing provider `{provider}`"))?;

    if provider == OPENROUTER_PROVIDER && plan.mode == CoverageMode::OfficialApi {
        let models = openrouter_fetcher().await?;
        return Ok(ProviderRefreshResult {
            provider: build_provider_catalog(
                &plan.provider,
                None,
                "ok",
                false,
                vec![],
                models.len(),
                &plan.source_kind,
                plan.source_url.clone(),
                &ctx.fetched_at,
            ),
            models,
        });
    }

    let previous_has_provider_models = previous_has_models(previous, provider);
    let (status, stale, errors) = scaffold_status_for_provider(previous_has_provider_models, "billing", provider);

    Ok(ProviderRefreshResult {
        provider: build_provider_catalog(
            &plan.provider,
            None,
            status,
            stale,
            errors,
            0,
            &plan.source_kind,
            plan.source_url.clone(),
            &ctx.fetched_at,
        ),
        models: vec![],
    })
}

pub async fn fetch_upstream_provider_entries(
    provider: &str,
    ctx: &PricingFetchContext,
) -> Result<ProviderRefreshResult, String> {
    fetch_upstream_provider_entries_with_previous(provider, ctx, None)
}

fn fetch_upstream_provider_entries_with_previous(
    provider: &str,
    ctx: &PricingFetchContext,
    previous: Option<&PricingCatalogResult>,
) -> Result<ProviderRefreshResult, String> {
    let plan = upstream_provider_fetch_plan(provider)
        .ok_or_else(|| format!("Unsupported upstream provider `{provider}`"))?;
    let previous_has_provider_models = previous_has_models(previous, provider);
    let (status, stale, errors) =
        scaffold_status_for_provider(previous_has_provider_models, "upstream", provider);

    Ok(ProviderRefreshResult {
        provider: build_provider_catalog(
            &plan.provider,
            Some(plan.provider.clone()),
            status,
            stale,
            errors,
            0,
            &plan.source_kind,
            plan.source_url.clone(),
            &ctx.fetched_at,
        ),
        models: vec![],
    })
}

pub fn merge_provider_refresh_batches(
    previous: Option<&PricingCatalogResult>,
    refreshes: Vec<ProviderRefreshResult>,
) -> PricingCatalogResult {
    let provider_catalogs: Vec<PricingProviderCatalog> =
        refreshes.iter().map(|refresh| refresh.provider.clone()).collect();
    let models: Vec<ModelPriceEntry> = refreshes
        .into_iter()
        .flat_map(|refresh| refresh.models)
        .collect();

    if let Some(previous) = previous {
        return merge_provider_refresh(previous, provider_catalogs, models);
    }

    let fetched_at = provider_catalogs
        .iter()
        .filter_map(|provider| chrono::DateTime::parse_from_rfc3339(&provider.fetched_at).ok())
        .map(|date| date.with_timezone(&Utc))
        .max()
        .unwrap_or_else(Utc::now);
    let stale = provider_catalogs.iter().any(|provider| provider.stale);
    let errors: Vec<String> = provider_catalogs
        .iter()
        .flat_map(|provider| provider.errors.clone())
        .collect();
    let errors = dedupe_strings(errors);

    PricingCatalogResult {
        providers: provider_catalogs,
        models,
        fetched_at: fetched_at.to_rfc3339(),
        expires_at: (fetched_at + Duration::hours(24)).to_rfc3339(),
        stale,
        errors,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum AppSourceTrack {
    Router,
    Tool,
    Direct,
}

pub fn app_source_to_billing_provider(source: &str) -> &str {
    match source {
        "claude_code" => "anthropic",
        "codex" => "openai",
        "gemini" => "google",
        "openrouter" => OPENROUTER_PROVIDER,
        "copilot" => "copilot",
        "kimi_k2" => "moonshot",
        "zai" => "zai",
        "warp" => "warp",
        "cursor" => "cursor",
        "kimi" => "kimi",
        "amp" => "amp",
        "factory" => "factory",
        "augment" => "augment",
        "jetbrains_ai" => "jetbrains_ai",
        "ollama_cloud" => "ollama_cloud",
        "kiro" => "kiro",
        other => other,
    }
}

pub fn normalize_model_id(model: &str) -> String {
    let mut normalized = model.trim().to_lowercase();

    if let Some((head, _)) = normalized.split_once('[') {
        normalized = head.trim().to_string();
    }

    if let Some(idx) = normalized.find(':').or_else(|| normalized.find('@')) {
        normalized.truncate(idx);
    }

    normalized.retain(|c| !c.is_whitespace());
    normalized = normalized.replace('_', "-").replace('.', "-");

    while normalized.contains("--") {
        normalized = normalized.replace("--", "-");
    }

    normalized = normalized.trim_matches('/').to_string();

    if let Some(slash_index) = normalized.rfind('/') {
        normalized = normalized[slash_index + 1..].to_string();
    }

    if let Some(date_start) = normalized.rfind('-') {
        let suffix = &normalized[date_start + 1..];
        if suffix.len() == 8 && suffix.chars().all(|c| c.is_ascii_digit()) {
            normalized.truncate(date_start);
        }
    }

    normalized.trim_matches('-').to_string()
}

pub fn alias_keys(model: &str) -> Vec<String> {
    let mut keys = Vec::new();
    let normalized = normalize_model_id(model);
    if !normalized.is_empty() {
        keys.push(normalized.clone());
    }

    let raw = model.trim().to_lowercase();
    if !raw.is_empty() && raw != normalized {
        keys.push(raw.clone());
    }

    if let Some(last_segment) = raw.rsplit('/').next() {
        let last_segment = normalize_model_id(last_segment);
        if !last_segment.is_empty() && last_segment != normalized {
            keys.push(last_segment);
        }
    }

    dedupe_strings(keys)
}

pub fn classify_upstream_provider(model: &str) -> Option<String> {
    let lowered = model.trim().to_lowercase();
    let effective = strip_routing_prefix(&lowered);

    if effective.starts_with("claude") {
        return Some("anthropic".to_string());
    }
    if effective.starts_with("gpt")
        || effective.starts_with("o3")
        || effective.starts_with("o4")
        || effective.starts_with("o1")
        || effective.starts_with("chatgpt")
        || effective.starts_with("codex")
        || effective.starts_with("dall-e")
        || effective.starts_with("tts")
        || effective.starts_with("whisper")
    {
        return Some("openai".to_string());
    }
    if effective.starts_with("gemini") {
        return Some("google".to_string());
    }
    if effective.starts_with("deepseek") {
        return Some("deepseek".to_string());
    }
    if effective.starts_with("kimi") || effective.starts_with("moonshot") {
        return Some("moonshot".to_string());
    }
    if effective.starts_with("glm") {
        return Some("zai".to_string());
    }
    if effective.starts_with("mistral")
        || effective.starts_with("codestral")
        || effective.starts_with("pixtral")
        || effective.starts_with("ministral")
    {
        return Some("mistral".to_string());
    }
    if effective.starts_with("llama") || effective.starts_with("meta-llama") {
        return Some("meta".to_string());
    }
    if effective.starts_with("qwen") {
        return Some("qwen".to_string());
    }
    if effective.starts_with("grok") {
        return Some("xai".to_string());
    }
    if effective.starts_with("command") || effective.starts_with("cohere") {
        return Some("cohere".to_string());
    }
    if effective.starts_with("yi-") {
        return Some("yi".to_string());
    }
    if effective.starts_with("baichuan") {
        return Some("baichuan".to_string());
    }
    if effective.starts_with("doubao") || effective.starts_with("bytedance") {
        return Some("bytedance".to_string());
    }
    if effective.starts_with("sensechat") || effective.starts_with("sensetime") {
        return Some("sensetime".to_string());
    }
    if effective.starts_with("perplexity") || effective.starts_with("pplx") {
        return Some("perplexity".to_string());
    }
    if effective.starts_with("minimax") {
        return Some("minimax".to_string());
    }
    if effective.starts_with("azure") {
        return Some("openai".to_string());
    }
    if effective.starts_with("stepfun") {
        return Some("stepfun".to_string());
    }
    if effective.starts_with("baidu") {
        return Some("baidu".to_string());
    }
    if effective.starts_with("tencent") {
        return Some("tencent".to_string());
    }
    if effective.starts_with("iflytek") {
        return Some("iflytek".to_string());
    }
    if effective.starts_with("internlm") {
        return Some("internlm".to_string());
    }
    if effective.starts_with("reka") {
        return Some("reka".to_string());
    }
    if effective.starts_with("nous") || effective.starts_with("nousresearch") {
        return Some("nous".to_string());
    }

    None
}

pub fn resolve_catalog_entry<'a>(
    app_source: &str,
    model: &str,
    catalog: &'a PricingCatalogResult,
) -> Option<&'a ModelPriceEntry> {
    let normalized_query = normalize_model_id(model);
    let query_aliases = alias_keys(model);
    let upstream_provider = classify_upstream_provider(model);
    let provider_priority = provider_priority(app_source, upstream_provider.as_deref());

    for provider in provider_priority {
        if let Some(entry) = best_entry_for_provider(
            &provider,
            model,
            &normalized_query,
            &query_aliases,
            &catalog.models,
        ) {
            return Some(entry);
        }
    }

    None
}

fn provider_priority(app_source: &str, upstream_provider: Option<&str>) -> Vec<String> {
    let mut priority = Vec::new();
    let billing_provider = app_source_to_billing_provider(app_source).to_string();

    match app_source_track(app_source) {
        AppSourceTrack::Router => {
            if let Some(upstream) = upstream_provider {
                priority.push(upstream.to_string());
            }
            priority.push(billing_provider);
        }
        AppSourceTrack::Tool => {
            priority.push(billing_provider);
            if let Some(upstream) = upstream_provider {
                priority.push(upstream.to_string());
            }
        }
        AppSourceTrack::Direct => {
            priority.push(billing_provider);
            if let Some(upstream) = upstream_provider {
                priority.push(upstream.to_string());
            }
            priority.push(OPENROUTER_PROVIDER.to_string());
        }
    }

    dedupe_strings(priority)
}

fn app_source_track(app_source: &str) -> AppSourceTrack {
    match app_source {
        "openrouter" => AppSourceTrack::Router,
        "copilot" | "warp" | "cursor" | "kimi" | "amp" | "factory" | "augment" | "jetbrains_ai" | "kiro" => {
            AppSourceTrack::Tool
        }
        _ => AppSourceTrack::Direct,
    }
}

fn best_entry_for_provider<'a>(
    provider: &str,
    model: &str,
    normalized_query: &str,
    query_aliases: &[String],
    models: &'a [ModelPriceEntry],
) -> Option<&'a ModelPriceEntry> {
    let provider_matches: Vec<(usize, u8, &ModelPriceEntry)> = models
        .iter()
        .enumerate()
        .filter_map(|(index, entry)| {
            provider_match_rank(entry, provider).map(|provider_rank| (index, provider_rank, entry))
        })
        .collect();

    for provider_rank in 0..=2 {
        let scoped: Vec<(usize, u8, &ModelPriceEntry)> = provider_matches
            .iter()
            .copied()
            .filter(|(_, rank, _)| *rank == provider_rank)
            .collect();

        if scoped.is_empty() {
            continue;
        }

        let exact_raw = select_best_entry(
            scoped.iter().copied().filter(|(_, _, entry)| {
                entry.model_id.eq_ignore_ascii_case(model)
            }),
        );
        if exact_raw.is_some() {
            return exact_raw;
        }

        let exact_normalized = select_best_entry(
            scoped.iter().copied().filter(|(_, _, entry)| {
                normalize_model_id(&entry.model_id) == normalized_query
                    || entry.normalized_model_id == normalized_query
            }),
        );
        if exact_normalized.is_some() {
            return exact_normalized;
        }

        let exact_alias = select_best_entry(scoped.iter().copied().filter(|(_, _, entry)| {
            entry.alias_keys.iter().any(|alias| {
                let normalized_alias = normalize_model_id(alias);
                query_aliases
                    .iter()
                    .any(|query_alias| normalize_model_id(query_alias) == normalized_alias)
            })
        }));
        if exact_alias.is_some() {
            return exact_alias;
        }

        let substring_matches: Vec<(usize, u8, &ModelPriceEntry)> = scoped
            .into_iter()
            .filter(|(_, _, entry)| {
                let candidate = normalize_model_id(&entry.model_id);
                let contains_normalized = !normalized_query.is_empty()
                    && candidate.contains(normalized_query);
                let alias_contains = entry.alias_keys.iter().any(|alias| {
                    let normalized_alias = normalize_model_id(alias);
                    !normalized_query.is_empty() && normalized_alias.contains(normalized_query)
                });
                contains_normalized || alias_contains
            })
            .collect();

        if substring_matches.len() == 1 {
            return Some(substring_matches[0].2);
        }
    }

    None
}

fn provider_match_rank(entry: &ModelPriceEntry, provider: &str) -> Option<u8> {
    if entry.billing_provider.eq_ignore_ascii_case(provider) {
        return Some(0);
    }
    if entry
        .upstream_provider
        .as_deref()
        .is_some_and(|upstream| upstream.eq_ignore_ascii_case(provider))
    {
        return Some(1);
    }
    if entry
        .resolved_from
        .as_deref()
        .is_some_and(|resolved_from| resolved_from.eq_ignore_ascii_case(provider))
    {
        return Some(2);
    }

    None
}

fn select_best_entry<'a, I>(entries: I) -> Option<&'a ModelPriceEntry>
where
    I: Iterator<Item = (usize, u8, &'a ModelPriceEntry)>,
{
    entries
        .min_by_key(|(index, provider_rank, entry)| {
            (*provider_rank, source_kind_rank(&entry.source_kind), *index)
        })
        .map(|(_, _, entry)| entry)
}

fn source_kind_rank(source_kind: &str) -> u8 {
    match source_kind {
        "official_api" => 0,
        "official_doc" => 1,
        "fallback_only" => 2,
        _ => 3,
    }
}

fn dedupe_strings(values: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    values
        .into_iter()
        .filter(|value| seen.insert(value.clone()))
        .collect()
}

fn strip_routing_prefix(model: &str) -> &str {
    let mut current = model;
    for prefix in [
        "openrouter/",
        "together/",
        "groq/",
        "openrouter-",
        "together-",
        "groq-",
    ] {
        if let Some(rest) = current.strip_prefix(prefix) {
            current = rest;
            break;
        }
    }

    for prefix in [
        "x-ai/",
        "anthropic/",
        "google/",
        "meta-llama/",
        "meta/",
        "mistralai/",
        "cohere/",
        "deepseek/",
        "qwen/",
        "microsoft/",
        "nvidia/",
        "01-ai/",
        "databricks/",
        "amazon/",
        "ai21/",
        "zhipu/",
        "zai/",
        "moonshot/",
        "baichuan/",
        "bytedance/",
        "minimax/",
        "sensetime/",
        "cloudflare/",
        "aihubmix/",
        "fireworks/",
        "cerebras/",
        "sambanova/",
        "stepfun/",
        "baidu/",
        "tencent/",
        "iflytek/",
        "internlm/",
        "reka/",
        "nousresearch/",
        "custom-proxy/",
    ] {
        if let Some(rest) = current.strip_prefix(prefix) {
            return rest;
        }
    }

    current
}

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
    }

    let context = PricingFetchContext::now();
    let mut refreshes =
        refresh_billing_provider_batches(cached.as_ref(), &context, &fetcher).await;
    refreshes.extend(refresh_upstream_provider_batches(cached.as_ref(), &context));

    if cached.is_none() {
        if let Some(openrouter_error) = refreshes
            .iter()
            .find(|refresh| refresh.provider.billing_provider == OPENROUTER_PROVIDER)
            .and_then(|refresh| {
                (refresh.provider.status == "error")
                    .then(|| refresh.provider.errors.first().cloned())
                    .flatten()
            })
        {
            return Err(openrouter_error);
        }
    }
    let catalog = merge_provider_refresh_batches(cached.as_ref(), refreshes);

    save_cached_catalog(&catalog)?;
    Ok(catalog)
}

fn normalize_openrouter_model(model: OpenRouterModel, fetched_at: &str) -> ModelPriceEntry {
    let normalized_model_id = model
        .canonical_slug
        .as_deref()
        .map(normalize_model_id)
        .unwrap_or_else(|| normalize_model_id(&model.id));
    let upstream_provider = classify_upstream_provider(&model.id);
    let mut aliases = alias_keys(&model.id);
    if let Some(canonical_slug) = model.canonical_slug.as_deref() {
        aliases.extend(alias_keys(canonical_slug));
    }
    aliases = dedupe_strings(aliases);

    ModelPriceEntry {
        billing_provider: OPENROUTER_PROVIDER.to_string(),
        upstream_provider,
        model_id: model.id,
        normalized_model_id,
        alias_keys: aliases,
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

async fn refresh_billing_provider_batches<F, Fut>(
    previous: Option<&PricingCatalogResult>,
    ctx: &PricingFetchContext,
    openrouter_fetcher: &F,
) -> Vec<ProviderRefreshResult>
where
    F: Fn() -> Fut,
    Fut: Future<Output = Result<Vec<ModelPriceEntry>, String>>,
{
    let mut refreshes = Vec::with_capacity(BILLING_PROVIDER_COVERAGE.len());

    for (provider, _) in BILLING_PROVIDER_COVERAGE {
        let refresh = match fetch_billing_provider_entries_with_fetcher(
            provider,
            ctx,
            previous,
            openrouter_fetcher,
        )
        .await
        {
            Ok(refresh) => refresh,
            Err(error) => build_failed_refresh(provider, None, ctx, previous, error),
        };
        refreshes.push(refresh);
    }

    refreshes
}

fn refresh_upstream_provider_batches(
    previous: Option<&PricingCatalogResult>,
    ctx: &PricingFetchContext,
) -> Vec<ProviderRefreshResult> {
    let mut refreshes = Vec::new();

    for (provider, _) in UPSTREAM_PROVIDER_COVERAGE {
        if billing_provider_coverage(provider).is_some() {
            continue;
        }

        let refresh = match fetch_upstream_provider_entries_with_previous(provider, ctx, previous) {
            Ok(refresh) => refresh,
            Err(error) => build_failed_refresh(provider, Some(provider.to_string()), ctx, previous, error),
        };
        refreshes.push(refresh);
    }

    refreshes
}

fn build_failed_refresh(
    provider: &str,
    upstream_provider: Option<String>,
    ctx: &PricingFetchContext,
    previous: Option<&PricingCatalogResult>,
    error: String,
) -> ProviderRefreshResult {
    let plan = billing_provider_fetch_plan(provider)
        .or_else(|| upstream_provider_fetch_plan(provider))
        .unwrap_or(ProviderFetchPlan {
            namespace: ProviderNamespace::Billing,
            provider: provider.to_string(),
            mode: CoverageMode::FallbackOnly,
            source_kind: "fallback_only".to_string(),
            source_url: None,
        });
    let previous_model_count = previous
        .map(|catalog| {
            catalog
                .models
                .iter()
                .filter(|entry| entry.billing_provider == provider)
                .count()
        })
        .unwrap_or_default();

    ProviderRefreshResult {
        provider: build_provider_catalog(
            provider,
            upstream_provider,
            "error",
            true,
            vec![error],
            previous_model_count,
            &plan.source_kind,
            plan.source_url,
            &ctx.fetched_at,
        ),
        models: vec![],
    }
}

fn previous_has_models(previous: Option<&PricingCatalogResult>, provider: &str) -> bool {
    previous.is_some_and(|catalog| {
        catalog
            .models
            .iter()
            .any(|entry| entry.billing_provider == provider)
    })
}

fn scaffold_status_for_provider(
    previous_has_provider_models: bool,
    namespace: &str,
    provider: &str,
) -> (&'static str, bool, Vec<String>) {
    if previous_has_provider_models {
        return (
            "error",
            true,
            vec![format!(
                "Pricing adapter for {namespace} provider `{provider}` is not implemented yet"
            )],
        );
    }

    ("stale", true, vec![])
}

fn build_provider_catalog(
    billing_provider: &str,
    upstream_provider: Option<String>,
    status: &str,
    stale: bool,
    errors: Vec<String>,
    model_count: usize,
    source_kind: &str,
    source_url: Option<String>,
    fetched_at: &str,
) -> PricingProviderCatalog {
    PricingProviderCatalog {
        billing_provider: billing_provider.to_string(),
        upstream_provider,
        status: status.to_string(),
        stale,
        errors,
        model_count,
        source_kind: source_kind.to_string(),
        source_url,
        fetched_at: fetched_at.to_string(),
    }
}

fn coverage_mode_source_kind(mode: CoverageMode) -> &'static str {
    match mode {
        CoverageMode::OfficialApi => "official_api",
        CoverageMode::OfficialDoc => "official_doc",
        CoverageMode::FallbackOnly => "fallback_only",
    }
}

fn coverage_source_url(namespace: ProviderNamespace, provider: &str) -> Option<&'static str> {
    match (namespace, provider) {
        (ProviderNamespace::Billing, "anthropic")
        | (ProviderNamespace::Upstream, "anthropic") => Some("https://www.anthropic.com/pricing"),
        (ProviderNamespace::Billing, "openai") | (ProviderNamespace::Upstream, "openai") => {
            Some("https://openai.com/api/pricing/")
        }
        (ProviderNamespace::Billing, "google") | (ProviderNamespace::Upstream, "google") => {
            Some("https://ai.google.dev/gemini-api/docs/pricing")
        }
        (ProviderNamespace::Billing, "openrouter") => Some(OPENROUTER_CATALOG_URL),
        (ProviderNamespace::Billing, "moonshot") | (ProviderNamespace::Upstream, "moonshot") => {
            Some("https://platform.moonshot.ai/docs/pricing/chat")
        }
        (ProviderNamespace::Billing, "zai") | (ProviderNamespace::Upstream, "zai") => {
            Some("https://docs.z.ai/guides/models")
        }
        (ProviderNamespace::Billing, "ollama_cloud") => Some("https://ollama.com/cloud"),
        (ProviderNamespace::Upstream, "deepseek") => Some("https://api-docs.deepseek.com/quick_start/pricing"),
        (ProviderNamespace::Upstream, "mistral") => Some("https://docs.mistral.ai/getting-started/pricing/"),
        (ProviderNamespace::Upstream, "meta") => Some("https://www.llama.com/llama-api/pricing/"),
        (ProviderNamespace::Upstream, "qwen") => Some("https://www.alibabacloud.com/help/en/model-studio/getting-started/models"),
        (ProviderNamespace::Upstream, "xai") => Some("https://docs.x.ai/docs/models"),
        (ProviderNamespace::Upstream, "cohere") => Some("https://cohere.com/pricing"),
        _ => None,
    }
}
