# Provider Pricing Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the OpenRouter-only dynamic pricing path with a backend-backed provider pricing catalog that covers the 16 Account providers, preserves one shared UI cost authority, and applies deterministic fallback rules.

**Architecture:** Add a Tauri pricing catalog layer that fetches provider prices, parses official pricing docs when needed, caches the merged catalog for 24 hours, and exposes read/refresh commands. Migrate the frontend pricing store to consume that catalog, then extend the shared pricing resolver so cost derivation remains frontend-owned but becomes aware of `app_source`, `billing_provider`, and upstream fallback behavior.

**Tech Stack:** Tauri 2, Rust, reqwest, serde, React 19, TypeScript, Zustand, TanStack Query, Vitest

---

## File Structure

- Create: `src-tauri/src/pricing_providers.rs`
- Create: `src-tauri/src/pricing_cache.rs`
- Create: `src-tauri/tests/pricing_catalog.rs`
- Create: `src/types/pricing.ts`
- Create: `src/lib/modelPricing.test.ts`
- Create: `src/components/pages/SettingsPage.test.tsx`
- Modify: `src-tauri/src/models.rs`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/stores/pricingStore.ts`
- Modify: `src/lib/modelPricing.ts`
- Modify: `src/lib/costing.ts`
- Modify: `src/lib/costing.test.ts`
- Modify: `src/hooks/useCostMetrics.ts`
- Modify: `src/components/pages/SettingsPage.tsx`
- Modify: `src/locales/en.json`
- Modify: `src/locales/zh.json`
- Modify: `src/locales/ja.json`
- Modify: `src/pages/cost-pages.test.tsx`

## Provider Coverage Matrix

Implementation is not complete until each provider is explicitly assigned one of:

- `official_api`
- `official_doc`
- `fallback_only`

Track that matrix in `src-tauri/src/pricing_providers.rs` as code comments or a constant map used by tests.

### Billing Provider Targets

- `anthropic` from `claude_code`: `official_doc`
- `openai` from `codex`: `official_doc`
- `google` from `gemini`: `official_doc`
- `openrouter`: `official_api`
- `copilot`: `fallback_only`
- `moonshot` from `kimi_k2`: `official_doc`
- `zai`: `official_doc`
- `warp`: `fallback_only`
- `cursor`: `fallback_only`
- `kimi`: `fallback_only`
- `amp`: `fallback_only`
- `factory`: `fallback_only`
- `augment`: `fallback_only`
- `jetbrains_ai`: `fallback_only`
- `ollama_cloud`: `official_doc`
- `kiro`: `fallback_only`

### Upstream Provider Targets

- `anthropic`: `official_doc`
- `openai`: `official_doc`
- `google`: `official_doc`
- `deepseek`: `official_doc`
- `moonshot`: `official_doc`
- `zai`: `official_doc`
- `mistral`: `official_doc`
- `meta`: `official_doc`
- `qwen`: `official_doc`
- `xai`: `official_doc`
- `cohere`: `official_doc`
- `yi`: `fallback_only`
- `baichuan`: `fallback_only`
- `bytedance`: `fallback_only`
- `sensetime`: `fallback_only`
- `perplexity`: `fallback_only`
- `minimax`: `fallback_only`
- `ai21`: `fallback_only`
- `stepfun`: `fallback_only`
- `baidu`: `fallback_only`
- `tencent`: `fallback_only`
- `iflytek`: `fallback_only`
- `internlm`: `fallback_only`
- `nvidia`: `fallback_only`
- `reka`: `fallback_only`
- `nous`: `fallback_only`

Tests in `src-tauri/tests/pricing_catalog.rs` must assert the matrix is complete so unresolved providers cannot silently disappear from v1.

## Task 1: Define Pricing Catalog Contracts And Tauri Command Surface

**Files:**
- Create: `src/types/pricing.ts`
- Modify: `src-tauri/src/models.rs`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: `src-tauri/tests/pricing_catalog.rs`

- [ ] **Step 1: Write the failing Rust test for catalog command shapes**

Create `src-tauri/tests/pricing_catalog.rs` with a focused contract test that expects:

- `get_pricing_catalog(false)` to return a `PricingCatalogResult`
- `refresh_pricing_catalog()` to return the same shape
- `PricingCatalogResult` to contain `providers`, `models`, `fetched_at`, `expires_at`, `stale`, `errors`

Example starter:

```rust
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
    assert!(json.get("fetchedAt").is_some());
}
```

- [ ] **Step 2: Run the targeted Rust test and verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml pricing_catalog -- --nocapture`

Expected: FAIL because the pricing catalog structs and commands do not exist yet.

- [ ] **Step 3: Add serializable pricing DTOs in Rust**

Extend `src-tauri/src/models.rs` with the pricing catalog response types:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PricingCatalogResult {
    pub providers: Vec<PricingProviderCatalog>,
    pub models: Vec<ModelPriceEntry>,
    pub fetched_at: String,
    pub expires_at: String,
    pub stale: bool,
    pub errors: Vec<String>,
}
```

Also add:

- `PricingProviderCatalog`
- `ModelPriceEntry`

Use `billing_provider`, `upstream_provider`, `model_id`, `normalized_model_id`, `alias_keys`, `input_per_m`, `output_per_m`, `cache_read_per_m`, `cache_write_per_m`, `source_kind`, `source_url`, `resolved_from`, `fetched_at`.

- [ ] **Step 4: Add Tauri command stubs**

In `src-tauri/src/commands.rs`, add:

```rust
#[tauri::command]
pub async fn get_pricing_catalog(force_refresh: Option<bool>) -> Result<PricingCatalogResult, String>

#[tauri::command]
pub async fn refresh_pricing_catalog() -> Result<PricingCatalogResult, String>
```

For now, return a clearly stubbed empty catalog from helper functions so the command surface exists before the real fetch/cache layer lands.

- [ ] **Step 5: Register the new commands**

Update `src-tauri/src/lib.rs` so the invoke handler includes:

- `get_pricing_catalog`
- `refresh_pricing_catalog`

- [ ] **Step 6: Mirror the response types in TypeScript**

Create `src/types/pricing.ts` with frontend types that match the Rust payload exactly:

```ts
export interface PricingCatalogResult {
  providers: PricingProviderCatalog[];
  models: ModelPriceEntry[];
  fetchedAt: string;
  expiresAt: string;
  stale: boolean;
  errors: string[];
}
```

- [ ] **Step 7: Re-run the targeted Rust test**

Run: `cargo test --manifest-path src-tauri/Cargo.toml pricing_catalog -- --nocapture`

Expected: PASS

- [ ] **Step 8: Commit the pricing contract layer**

```bash
git add src-tauri/src/models.rs src-tauri/src/commands.rs src-tauri/src/lib.rs src-tauri/tests/pricing_catalog.rs src/types/pricing.ts
git commit -m "feat: add pricing catalog command contracts"
```

## Task 2: Build Cache Storage And OpenRouter Baseline Catalog

**Files:**
- Create: `src-tauri/src/pricing_cache.rs`
- Create: `src-tauri/src/pricing_providers.rs`
- Test: `src-tauri/tests/pricing_catalog.rs`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add failing cache behavior tests**

Extend `src-tauri/tests/pricing_catalog.rs` with tests for:

- cache file path resolves to `~/.cc-statistics/pricing-cache.json`
- a fresh cache is returned without network fetch
- stale cache can still be returned on non-forced reads
- refresh failure preserves the last successful catalog
- provider refresh status is stored per `billing_provider`
- one provider failing refresh preserves only that provider's previous entries while updated providers still advance

Example fixture assertion:

```rust
#[test]
fn stale_cache_survives_refresh_failure() {
    let cache = PricingCatalogResult { /* last successful snapshot */ };
    write_cache(&tmp_dir, &cache).unwrap();
    let result = load_or_refresh_catalog(false, failing_fetcher).unwrap();
    assert!(result.stale);
    assert_eq!(result.models.len(), cache.models.len());
}
```

- [ ] **Step 2: Run the Rust test and verify failure**

Run: `cargo test --manifest-path src-tauri/Cargo.toml pricing_catalog -- --nocapture`

Expected: FAIL because there is no cache layer yet.

- [ ] **Step 3: Implement cache read/write helpers**

Create `src-tauri/src/pricing_cache.rs` with focused helpers:

```rust
pub fn pricing_cache_path() -> Result<PathBuf, String>
pub fn load_cached_catalog() -> Result<Option<PricingCatalogResult>, String>
pub fn save_cached_catalog(catalog: &PricingCatalogResult) -> Result<(), String>
pub fn is_catalog_fresh(catalog: &PricingCatalogResult, now: DateTime<Utc>) -> bool
pub fn merge_provider_refresh(
    previous: &PricingCatalogResult,
    refreshed: Vec<PricingProviderCatalog>,
    refreshed_models: Vec<ModelPriceEntry>,
) -> PricingCatalogResult
```

Rules:

- store cache in `~/.cc-statistics/pricing-cache.json`
- treat 24 hours as fresh
- never delete a valid old snapshot during a failed refresh
- keep `PricingProviderCatalog.status`, `stale`, `errors`, and previous `models` at provider granularity
- merge successful provider refreshes into the prior snapshot instead of replacing the whole catalog

- [ ] **Step 4: Add an OpenRouter catalog fetcher as the first real adapter**

Create the initial implementation in `src-tauri/src/pricing_providers.rs`:

```rust
pub async fn fetch_openrouter_catalog() -> Result<Vec<ModelPriceEntry>, String>
pub async fn get_catalog(force_refresh: bool) -> Result<PricingCatalogResult, String>
```

For this task, only implement:

- OpenRouter fetch
- basic model normalization
- merged `PricingCatalogResult`
- cache read/write integration
- per-provider catalog status for `openrouter`

Leave provider-specific official adapters for the next task.

- [ ] **Step 5: Wire the command stubs to the cache-backed fetcher**

Update `src-tauri/src/commands.rs` so:

- `get_pricing_catalog(force_refresh)` uses cache if fresh unless forced
- `refresh_pricing_catalog()` always attempts a refresh
- both return the preserved cache snapshot when refresh fails
- returned payload preserves provider-level stale/error metadata

- [ ] **Step 6: Re-run the targeted Rust tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml pricing_catalog -- --nocapture`

Expected: PASS

- [ ] **Step 7: Commit the cache and OpenRouter baseline**

```bash
git add src-tauri/src/pricing_cache.rs src-tauri/src/pricing_providers.rs src-tauri/src/commands.rs src-tauri/tests/pricing_catalog.rs
git commit -m "feat: add cached pricing catalog baseline"
```

## Task 3: Lock The Billing/Upstream Coverage Matrix In Rust

**Files:**
- Modify: `src-tauri/src/pricing_providers.rs`
- Modify: `src-tauri/tests/pricing_catalog.rs`
- Modify: `src-tauri/src/models.rs`

- [ ] **Step 1: Add failing matrix completeness tests**

Extend `src-tauri/tests/pricing_catalog.rs` with fixture-driven tests that cover:

- every billing provider in the plan matrix has a declared coverage mode
- every upstream provider in the spec namespace has a declared coverage mode
- missing coverage entries fail loudly
- `fallback_only` providers still remain addressable by the merged resolver

Use explicit test names such as:

```rust
#[test]
fn billing_provider_matrix_is_complete()

#[test]
fn upstream_provider_matrix_is_complete()
```

- [ ] **Step 2: Run the Rust matrix tests and verify failure**

Run: `cargo test --manifest-path src-tauri/Cargo.toml pricing_catalog -- --nocapture`

Expected: FAIL because the coverage matrix is not encoded yet.

- [ ] **Step 3: Add explicit coverage maps**

In `src-tauri/src/pricing_providers.rs`, add stable coverage declarations for:

- all billing providers
- all upstream providers

Use concrete enums:

```rust
enum CoverageMode {
    OfficialApi,
    OfficialDoc,
    FallbackOnly,
}
```

and constant maps like:

```rust
const BILLING_PROVIDER_COVERAGE: &[(&str, CoverageMode)] = &[ ... ];
const UPSTREAM_PROVIDER_COVERAGE: &[(&str, CoverageMode)] = &[ ... ];
```

- [ ] **Step 4: Re-run the matrix completeness tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml pricing_catalog -- --nocapture`

Expected: PASS

- [ ] **Step 5: Commit the pricing coverage matrix**

```bash
git add src-tauri/src/pricing_providers.rs src-tauri/src/models.rs src-tauri/tests/pricing_catalog.rs
git commit -m "feat: define pricing coverage matrix"
```

## Task 4: Implement Provider-Aware Resolution And Fallback Merge In Rust

**Files:**
- Modify: `src-tauri/src/pricing_providers.rs`
- Modify: `src-tauri/tests/pricing_catalog.rs`

- [ ] **Step 1: Add failing resolver tests for provider priority**

Extend `src-tauri/tests/pricing_catalog.rs` with fixture-driven tests that cover:

- `app_source=openrouter` resolves `upstream official -> openrouter -> fallback`
- `app_source=cursor` prefers `cursor official -> cursor doc -> upstream official`
- custom alias/normalized ids match the same catalog entry
- ambiguous substring matches fall through instead of guessing
- per-provider refresh preserves old entries for failing providers while merging new entries from successful ones

Use explicit test names such as:

```rust
#[test]
fn openrouter_sessions_prefer_upstream_price_before_openrouter()

#[test]
fn tool_providers_prefer_tool_price_before_upstream()

#[test]
fn provider_merge_preserves_old_entries_for_failed_provider_refresh()
```

- [ ] **Step 2: Run the Rust resolver tests and verify failure**

Run: `cargo test --manifest-path src-tauri/Cargo.toml pricing_catalog -- --nocapture`

Expected: FAIL because the catalog still only knows OpenRouter baseline data.

- [ ] **Step 3: Add canonical provider mapping helpers**

In `src-tauri/src/pricing_providers.rs`, add small pure helpers:

```rust
fn app_source_to_billing_provider(source: &str) -> &str
fn normalize_model_id(model: &str) -> String
fn alias_keys(model: &str) -> Vec<String>
fn classify_upstream_provider(model: &str) -> Option<String>
```

Implement the exact namespaces defined by the spec:

- `app_source`
- `billing_provider`
- `upstream_provider`

- [ ] **Step 4: Add provider adapter scaffolding**

In `src-tauri/src/pricing_providers.rs`, create a common adapter contract:

```rust
struct PricingFetchContext { /* now, cache, client */ }

async fn fetch_billing_provider_entries(provider: &str, ctx: &PricingFetchContext) -> Result<Vec<ModelPriceEntry>, String>
async fn fetch_upstream_provider_entries(provider: &str, ctx: &PricingFetchContext) -> Result<Vec<ModelPriceEntry>, String>
```

For v1, the adapter implementation must consult the coverage maps from Task 3 so each provider follows one explicit path:

- `OfficialApi`
- `OfficialDoc`
- `FallbackOnly`

- [ ] **Step 5: Implement the merged fallback resolver**

Still in `src-tauri/src/pricing_providers.rs`, add the catalog merge logic that records:

- `billingProvider`
- `upstreamProvider`
- `sourceKind`
- `resolvedFrom`

for each model entry.

Also enforce provider-granularity merge behavior:

- refresh each provider independently
- preserve previous model entries only for providers that failed
- update `PricingProviderCatalog.status`, `stale`, and `errors` per provider

Do not calculate session cost here. Only build the catalog.

- [ ] **Step 6: Re-run the Rust resolver tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml pricing_catalog -- --nocapture`

Expected: PASS

- [ ] **Step 7: Commit the provider-aware Rust resolver**

```bash
git add src-tauri/src/pricing_providers.rs src-tauri/src/models.rs src-tauri/tests/pricing_catalog.rs
git commit -m "feat: add provider-aware pricing catalog resolution"
```

## Task 5: Migrate The Frontend Pricing Store To The Tauri Catalog

**Files:**
- Modify: `src/stores/pricingStore.ts`
- Modify: `src/types/pricing.ts`
- Modify: `src/components/pages/SettingsPage.tsx`
- Test: `src/components/pages/SettingsPage.test.tsx`

- [ ] **Step 1: Add the failing store/UI test**

Create `src/components/pages/SettingsPage.test.tsx` with focused tests so it expects:

- `fetchPricing()` to call the Tauri command instead of `fetch()`
- `lastFetched`, `stale`, and `error` to be driven by the catalog payload
- Settings refresh button to reflect `isFetching` and preserve previous model counts on failure

Example assertion:

```ts
expect(invoke).toHaveBeenCalledWith('get_pricing_catalog', { forceRefresh: false });
expect(screen.getByText(/updated/i)).toBeInTheDocument();
```

- [ ] **Step 2: Run the targeted Vitest test and verify failure**

Run: `pnpm vitest run src/components/pages/SettingsPage.test.tsx`

Expected: FAIL because the store still fetches OpenRouter directly.

- [ ] **Step 3: Replace the OpenRouter-only store with a catalog-backed store**

Update `src/stores/pricingStore.ts` so it:

- invokes `get_pricing_catalog`
- invokes `refresh_pricing_catalog`
- stores `catalog`, `models`, `providers`, `lastFetched`, `expiresAt`, `stale`, `error`, `isFetching`
- no longer performs direct `fetch(OPENROUTER_API)`

Use a concrete state shape such as:

```ts
interface PricingStore {
  catalog: PricingCatalogResult | null;
  models: ModelPriceEntry[];
  providers: PricingProviderCatalog[];
  stale: boolean;
  fetchPricing: (forceRefresh?: boolean) => Promise<void>;
  refreshPricing: () => Promise<void>;
}
```

- [ ] **Step 4: Keep Settings minimal but truthful**

Update `src/components/pages/SettingsPage.tsx` so the pricing card shows:

- number of catalog models
- last updated time
- stale badge or text when cache is stale
- manual refresh action

Do not add debug tables to the main settings screen in this task.

- [ ] **Step 5: Re-run the targeted Vitest test**

Run: `pnpm vitest run src/components/pages/SettingsPage.test.tsx`

Expected: PASS

- [ ] **Step 6: Commit the frontend catalog-store migration**

```bash
git add src/stores/pricingStore.ts src/types/pricing.ts src/components/pages/SettingsPage.tsx src/components/pages/SettingsPage.test.tsx
git commit -m "feat: migrate pricing store to tauri catalog"
```

## Task 6: Make The Shared Pricing Resolver Source-Aware And Preserve Cost Consistency

**Files:**
- Modify: `src/lib/modelPricing.ts`
- Create: `src/lib/modelPricing.test.ts`
- Modify: `src/lib/costing.ts`
- Modify: `src/lib/costing.test.ts`
- Modify: `src/hooks/useCostMetrics.ts`

- [ ] **Step 1: Add failing unit tests for source-aware pricing resolution**

Create `src/lib/modelPricing.test.ts` with tests for:

- `app_source:model` custom overrides beat all dynamic catalog entries
- `billing_provider:model` beats plain `model`
- `openrouter` sessions prefer upstream official entries before OpenRouter entries
- `cursor` sessions prefer tool entries before upstream entries
- alias keys like `claude-sonnet-4.5` resolve to `claude-sonnet-4-5`
- ambiguous substring matches fall through to next layer

Starter:

```ts
it('prefers app_source override before billing provider and model', () => {
  const result = resolveModelPricing('claude-sonnet-4-5', {
    appSource: 'cursor',
    customPricingEnabled: true,
    customPricing: {
      'cursor:claude-sonnet-4-5': { input: 1, output: 2, cacheRead: 0, cacheCreation: 0 },
    },
    dynamicPricing: [],
  });
  expect(result.source).toBe('custom');
});
```

- [ ] **Step 2: Run the frontend unit tests and verify failure**

Run: `pnpm vitest run src/lib/modelPricing.test.ts src/lib/costing.test.ts`

Expected: FAIL because the resolver is model-only and not source-aware.

- [ ] **Step 3: Extend the shared pricing resolver**

Update `src/lib/modelPricing.ts` so the resolver accepts source context:

```ts
export interface PricingContext {
  appSource?: string;
  customPricingEnabled: boolean;
  customPricing: Record<string, ModelPricing>;
  dynamicPricing: readonly PricingCandidate[];
  fallbackPricing?: PricingCandidate;
}
```

And resolves in this order:

1. `app_source:model`
2. `billing_provider:model`
3. `model`
4. dynamic catalog entries with exact / normalized / alias / unique substring matching
5. fallback

- [ ] **Step 4: Keep cost derivation frontend-owned**

Update `src/lib/costing.ts` and `src/hooks/useCostMetrics.ts` so all session cost derivation continues to run on the frontend, but every per-model lookup now passes `session.source` into `resolveModelPricing`.

Do not reintroduce page-local pricing math.

- [ ] **Step 5: Re-run the frontend unit tests**

Run: `pnpm vitest run src/lib/modelPricing.test.ts src/lib/costing.test.ts`

Expected: PASS

- [ ] **Step 6: Commit the source-aware pricing resolver**

```bash
git add src/lib/modelPricing.ts src/lib/modelPricing.test.ts src/lib/costing.ts src/lib/costing.test.ts src/hooks/useCostMetrics.ts
git commit -m "feat: make pricing resolution source-aware"
```

## Task 7: Finish Settings Copy, Cross-Page Regression Coverage, And Final Verification

**Files:**
- Modify: `src/components/pages/SettingsPage.tsx`
- Modify: `src/components/pages/SettingsPage.test.tsx`
- Modify: `src/locales/en.json`
- Modify: `src/locales/zh.json`
- Modify: `src/locales/ja.json`
- Modify: `src/pages/cost-pages.test.tsx`

- [ ] **Step 1: Add the failing UI regression assertions**

Extend `src/pages/cost-pages.test.tsx` so it verifies:

- cost pages still agree on the same totals after catalog migration
- the migrated resolver still produces the same totals across Dashboard, Cost Breakdown, Sessions, and Report

Example:

```ts
expect(screen.getByText('$6.12')).toBeInTheDocument();
```

- [ ] **Step 2: Run the UI regression test and verify failure**

Run: `pnpm vitest run src/pages/cost-pages.test.tsx src/components/pages/SettingsPage.test.tsx`

Expected: FAIL because the refreshed settings copy and final page assertions are not fully wired yet.

- [ ] **Step 3: Add minimal localized pricing-refresh copy**

Update:

- `src/locales/en.json`
- `src/locales/zh.json`
- `src/locales/ja.json`

Add only the strings needed for:

- refresh action
- fetching state
- stale cache indicator
- last updated label
- refresh failure fallback note

- [ ] **Step 4: Tighten the Settings rendering**

Finish `src/components/pages/SettingsPage.tsx` so the pricing section handles:

- no data yet
- healthy cached data
- stale cached data
- refresh error with retained snapshot

Keep the component focused. Do not add a provider drill-down inspector in this pass.

- [ ] **Step 5: Re-run the focused frontend regression test**

Run: `pnpm vitest run src/pages/cost-pages.test.tsx src/components/pages/SettingsPage.test.tsx`

Expected: PASS

- [ ] **Step 6: Run the full verification set**

Run: `cargo test --manifest-path src-tauri/Cargo.toml pricing_catalog -- --nocapture`
Expected: PASS

Run: `pnpm vitest run src/lib/modelPricing.test.ts src/lib/costing.test.ts src/pages/cost-pages.test.tsx src/components/pages/SettingsPage.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit the final pricing-catalog integration**

```bash
git add src/components/pages/SettingsPage.tsx src/components/pages/SettingsPage.test.tsx src/locales/en.json src/locales/zh.json src/locales/ja.json src/pages/cost-pages.test.tsx
git commit -m "feat: finish provider pricing catalog integration"
```

## Execution Notes

- Do not move cost math into Rust during this plan.
- Do not remove existing custom pricing functionality.
- Keep provider-doc parsing behind explicit official URLs only.
- Preserve old cached pricing on refresh failure.
- Keep OpenRouter as a deterministic fallback layer, not the first authority except where no better source exists.
