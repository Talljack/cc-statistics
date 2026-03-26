# Provider Pricing Catalog Design

Date: 2026-03-26

## Context

The app currently computes displayed cost from token counts and a frontend pricing store:

- [src/lib/costing.ts](/Users/yugangcao/apps/my-apps/cc-statistics/src/lib/costing.ts) derives all visible money values from `tokens_by_model`
- [src/lib/modelPricing.ts](/Users/yugangcao/apps/my-apps/cc-statistics/src/lib/modelPricing.ts) resolves custom pricing, dynamic pricing, and fallback pricing
- [src/stores/pricingStore.ts](/Users/yugangcao/apps/my-apps/cc-statistics/src/stores/pricingStore.ts) fetches dynamic pricing only from OpenRouter

This is no longer sufficient. The user wants displayed cost to use the corresponding provider's official pricing instead of treating OpenRouter as the default price authority.

The app already has a backend provider integration layer for account/quota information in [src-tauri/src/account_providers.rs](/Users/yugangcao/apps/my-apps/cc-statistics/src-tauri/src/account_providers.rs). That file currently covers 16 providers:

- `claude_code`
- `codex`
- `gemini`
- `openrouter`
- `copilot`
- `kimi_k2`
- `zai`
- `warp`
- `cursor`
- `kimi`
- `amp`
- `factory`
- `augment`
- `jetbrains_ai`
- `ollama_cloud`
- `kiro`

The cost system should use the same provider universe.

## Goal

Introduce a unified provider pricing catalog so every displayed cost continues to be derived from session token data, but price lookup no longer defaults to OpenRouter.

The new system must:

- cover the same 16 providers used by Account
- prefer provider-specific official pricing sources
- support both official APIs and official pricing documentation pages
- cache pricing locally for 24 hours
- allow manual refresh from Settings
- fall back safely when official sources fail
- preserve whole-app cost consistency across Dashboard, Cost Breakdown, Sessions, Report, and tray

## Non-Goals

- reproducing exact subscription amortization for proprietary tools such as Cursor or Copilot
- implementing historical price versioning or time-travel pricing
- moving all cost math into Rust in this pass
- changing token parsing or session aggregation
- removing existing custom pricing overrides
- exposing every pricing-debug field in the main UI in v1

## Product Rules

### Canonical Cost Derivation

Displayed money values remain derived from session-level `tokens_by_model`.

For each model bucket:

`cost = input_tokens / 1_000_000 * input_per_m + output_tokens / 1_000_000 * output_per_m`

Cache tokens remain visible in token analytics. Whether cache cost is shown separately is unchanged by this spec. The main billable total must continue to be derived from the same shared cost layer.

### Price Resolution Priority

Price lookup for a session model bucket must resolve in this order:

1. user custom pricing
2. tool/provider official machine-readable price or credits mapping
3. tool/provider official pricing documentation or model page parsing
4. upstream model provider official price
5. OpenRouter price for the matching model
6. local fallback price

This order is global and deterministic. Every cost surface must use the same order.

### Billing Provider Before Upstream Provider

Price lookup must distinguish between:

- `app_source`: one of the 16 session/account source ids already used by the app, such as `cursor`, `openrouter`, `claude_code`
- `billing_provider`: the price authority namespace used by the pricing catalog
- `upstream_provider`: who owns the underlying model family

Canonical identifier namespaces in v1:

- `app_source` always uses the existing app ids from session/account data:
  - `claude_code`, `codex`, `gemini`, `openrouter`, `copilot`, `kimi_k2`, `zai`, `warp`, `cursor`, `kimi`, `amp`, `factory`, `augment`, `jetbrains_ai`, `ollama_cloud`, `kiro`
- `billing_provider` uses a stable internal catalog namespace:
  - tool or route providers keep their app-style ids, for example `cursor`, `warp`, `openrouter`
  - direct providers map to their vendor ids, for example `anthropic`, `openai`, `google`, `moonshot`, `zai`, `ollama_cloud`
- `upstream_provider` uses normalized model-vendor ids:
  - `anthropic`, `openai`, `google`, `zai`, `moonshot`, `xai`, `deepseek`, `mistral`, `meta`, `qwen`, `cohere`, `yi`, `baichuan`, `bytedance`, `sensetime`, `perplexity`, `minimax`, `ai21`, `stepfun`, `baidu`, `tencent`, `iflytek`, `internlm`, `nvidia`, `reka`, `nous`

Rules:

- `ProviderCatalog.provider` must always use `billing_provider`
- custom pricing keys use `app_source:model`, then `billing_provider:model`, then `model`
- Settings refresh status is keyed by `billing_provider`
- upstream adapters are also keyed by `upstream_provider`

Examples:

- `source=cursor`, model `claude-sonnet-4-5`
  - `app_source=cursor`
  - `billing_provider=cursor`
  - `upstream_provider=anthropic`
- `source=openrouter`, model `google/gemini-2.5-pro`
  - `app_source=openrouter`
  - `billing_provider=openrouter`
  - `upstream_provider=google`
- `source=claude_code`, model `claude-opus-4-6`
  - `app_source=claude_code`
  - `billing_provider=anthropic`
  - `upstream_provider=anthropic`

Tool-style providers must prefer their own official pricing system first. Only if that fails should the system estimate from the upstream model provider.

### Failure Policy

The pricing system must degrade safely:

- never clear a previously successful cache because a refresh failed
- fall back at model granularity, not only at provider granularity
- mark stale cache instead of blocking the UI
- keep old data available during refresh failures

The guiding rule is:

- stale but explainable is acceptable
- wrong due to unsafe guessing is not acceptable

## Options Considered

### Option 1: Expand frontend pricing store only

Keep all price fetching in [src/stores/pricingStore.ts](/Users/yugangcao/apps/my-apps/cc-statistics/src/stores/pricingStore.ts) and add multiple provider/document fetchers in the frontend.

Pros:

- smallest conceptual shift

Cons:

- duplicates backend provider integration patterns
- harder to handle official doc parsing and local caching robustly
- pushes more network and parsing fragility into the browser

### Option 2: Move both pricing and cost derivation into Rust

Make Tauri fetch prices and compute final displayed costs.

Pros:

- one backend authority

Cons:

- larger refactor
- duplicates existing frontend cost derivation and settings integration
- higher risk for this pass

### Option 3: Backend pricing catalog, frontend cost derivation

Add a backend pricing catalog layer in Tauri. The frontend keeps its shared cost derivation path but uses backend-provided dynamic pricing instead of OpenRouter-only pricing.

Pros:

- best fit with current architecture
- aligns with existing account-provider integration style
- centralizes fragile network/doc parsing in the backend
- preserves current UI-side consistency model

Cons:

- requires coordinated backend and frontend changes

### Recommendation

Choose Option 3.

This keeps the fragile part, provider-specific price acquisition, in the backend and keeps the stable part, UI-wide cost aggregation from token buckets, in the frontend.

## Architecture

### Backend Modules

Add a new pricing-catalog layer in Tauri:

- `src-tauri/src/pricing_providers.rs`
- `src-tauri/src/pricing_cache.rs`

Responsibilities:

- fetch provider pricing from official sources
- parse official pricing documentation pages when needed
- normalize and merge all provider price entries into one catalog
- apply fallback chaining
- persist and load cache
- expose Tauri commands for reading and refreshing the catalog

### Frontend Responsibilities

The frontend remains responsible for:

- reading sessions and `tokens_by_model`
- applying user custom pricing overrides
- deriving `totalCost`, `costByType`, `costByModel`, `costBySession`
- formatting and rendering money values

The frontend pricing store stops being an OpenRouter fetcher and becomes a cache/view model over the backend pricing catalog.

## Data Model

### Pricing Catalog Result

The backend should return a single catalog payload shaped like:

- `providers: PricingProviderCatalog[]`
- `models: ModelPriceEntry[]`
- `fetchedAt`
- `expiresAt`
- `stale`
- `errors`

### Model Price Entry

Each price entry should include at least:

- `billingProvider`
- `upstreamProvider`
- `modelId`
- `normalizedModelId`
- `aliasKeys[]`
- `inputPerM`
- `outputPerM`
- `cacheReadPerM`
- `cacheWritePerM`
- `sourceKind`
- `sourceUrl`
- `resolvedFrom`
- `fetchedAt`

`sourceKind` should be one of:

- `tool_api`
- `tool_doc`
- `upstream_api`
- `upstream_doc`
- `openrouter`
- `fallback`

`resolvedFrom` should explain the chosen authority, for example:

- `cursor_official`
- `anthropic_official`
- `openrouter_match`
- `local_fallback`

### Provider Catalog

Each provider catalog should include:

- `provider`
- `status`
- `fetchedAt`
- `stale`
- `modelCount`
- `errors[]`

This enables Settings to explain refresh state without exposing raw parser internals.

## Provider Scope

The pricing framework must cover the same 16 Account providers:

1. `claude_code`
2. `codex`
3. `gemini`
4. `openrouter`
5. `copilot`
6. `kimi_k2`
7. `zai`
8. `warp`
9. `cursor`
10. `kimi`
11. `amp`
12. `factory`
13. `augment`
14. `jetbrains_ai`
15. `ollama_cloud`
16. `kiro`

### Provider Classification

For pricing purposes, these providers should be treated in three groups.

#### Direct or mostly direct providers

- `claude_code`
- `codex`
- `gemini`
- `kimi_k2`
- `zai`
- `ollama_cloud`

Priority:

1. provider official source
2. provider official docs
3. OpenRouter
4. fallback

#### Tool-style providers with their own pricing systems

- `copilot`
- `warp`
- `cursor`
- `kimi`
- `amp`
- `factory`
- `augment`
- `jetbrains_ai`
- `kiro`

Priority:

1. tool official machine-readable pricing or credits mapping
2. tool official pricing docs
3. upstream provider official price
4. OpenRouter
5. fallback

#### Route-style providers

- `openrouter`

Priority:

1. upstream provider official price
2. OpenRouter official price
3. fallback

Important clarification:

- for `app_source=openrouter`, the billing surface is still `openrouter`
- the first pricing authority is still the upstream provider's official price if available
- OpenRouter price is the explicit fallback for OpenRouter sessions, not the default first choice

This resolves the session source deterministically:

- same `app_source=openrouter`
- same model id
- same resolution order every time: upstream official -> OpenRouter -> fallback

## Upstream Provider Scope

v1 must provide first-class upstream-provider support for every normalized upstream provider currently recognized by [src-tauri/src/commands.rs](/Users/yugangcao/apps/my-apps/cc-statistics/src-tauri/src/commands.rs) model classification logic:

1. `anthropic`
2. `openai`
3. `google`
4. `deepseek`
5. `moonshot`
6. `zai`
7. `mistral`
8. `meta`
9. `qwen`
10. `xai`
11. `cohere`
12. `yi`
13. `baichuan`
14. `bytedance`
15. `sensetime`
16. `perplexity`
17. `minimax`
18. `ai21`
19. `stepfun`
20. `baidu`
21. `tencent`
22. `iflytek`
23. `internlm`
24. `nvidia`
25. `reka`
26. `nous`

Planning rule:

- if an upstream provider has an official API or official pricing page, v1 should add an adapter or parser for it
- if an upstream provider has no stable official price source during implementation, it is still part of the v1 namespace but may resolve through OpenRouter or local fallback
- the implementation plan must track which upstream providers land with:
  - official API
  - official doc parsing
  - OpenRouter fallback only

This keeps the scope explicit without blocking the unified resolver on incomplete official coverage.

## Adapter Design

Each provider should expose one adapter with a common contract:

- identify supported pricing authority
- fetch official machine-readable price data if available
- otherwise fetch and parse official pricing docs
- normalize entries into the shared catalog shape

Adapters must not calculate session cost. They only produce price entries.

### Official Documentation Parsing

When no official price API exists, doc parsing is allowed only for pre-approved official URLs.

The parser should:

- fetch the official page HTML
- prefer structured data or stable tables
- fall back to provider-specific extraction rules only when necessary
- convert all extracted prices into USD per million tokens

The parser should never scrape arbitrary third-party pages.

### OpenRouter Fallback Adapter

OpenRouter remains part of the system as a catalog source and a deterministic fallback layer.

This adapter should:

- fetch the OpenRouter models endpoint
- normalize its prices into the same shared shape
- be used for model-level fallback when official provider sources fail
- be used for `app_source=openrouter` only after upstream official pricing lookup has failed

## Matching Rules

### Canonical Resolver Signature

Price resolution should be based on:

- `session.source`
- `raw model id`
- `normalized model id`

Conceptually:

`resolvePrice(source, modelId, pricingCatalog, customPricing)`

### Normalization

Extend the current model normalization behavior in [src/lib/modelPricing.ts](/Users/yugangcao/apps/my-apps/cc-statistics/src/lib/modelPricing.ts) so every catalog entry and every session model bucket share the same normalization rules:

- lowercase
- trim whitespace
- remove bracketed suffixes such as `[1m]`
- remove trailing `:variant` and `@variant`
- normalize `_` and `.` into `-`
- collapse repeated `-`
- strip provider-org prefixes for normalized comparison

Add alias support for common punctuation/version variants such as:

- `claude-sonnet-4.5` -> `claude-sonnet-4-5`
- `gemini-2.5-pro` -> `gemini-2-5-pro`
- `glm-4.7` -> `glm-4-7`

### Matching Order

For a given resolution layer, match candidates in this order:

1. exact raw id
2. exact normalized id
3. alias key
4. unique substring candidate

Substring matching is allowed only when exactly one candidate matches. If multiple candidates match, the resolver must treat it as ambiguous and fall through to the next layer.

### Custom Pricing Keys

User custom pricing should support these keys in descending priority:

1. `app_source:model`
2. `billing_provider:model`
3. `model`

This preserves the ability to override the same underlying model differently for different billing surfaces.

## Caching and Refresh

### Storage

Persist the catalog to:

- `~/.cc-statistics/pricing-cache.json`

### Policy

Use:

- lazy loading on app startup
- 24 hour cache TTL
- manual refresh from Settings

The frontend should request the catalog when cost-related views need it. The backend should return cache immediately when valid. When stale:

- non-forced read may still return the stale cache
- forced refresh should attempt network refresh immediately

### Cache Contents

The cache file should include:

- the last successful merged catalog
- per-provider fetch status
- source URLs used
- fetch timestamps
- stale metadata
- error summaries

### Manual Refresh

Settings should expose a refresh action that:

- calls a dedicated Tauri refresh command
- updates `isFetching`, `lastFetched`, `stale`, and `error`
- preserves the old catalog on failure

## Frontend Integration

### Pricing Store

[src/stores/pricingStore.ts](/Users/yugangcao/apps/my-apps/cc-statistics/src/stores/pricingStore.ts) should change responsibilities:

- remove direct OpenRouter fetch logic
- load catalog from Tauri commands
- expose merged model entries as `dynamicPricing`
- keep `isFetching`, `error`, `lastFetched`
- add `stale`
- add manual refresh support

### Shared Cost Resolver

[src/lib/modelPricing.ts](/Users/yugangcao/apps/my-apps/cc-statistics/src/lib/modelPricing.ts) should evolve from a model-only resolver into a resolver that also understands billing source context.

It must remain the single shared resolver used by:

- [src/lib/costing.ts](/Users/yugangcao/apps/my-apps/cc-statistics/src/lib/costing.ts)
- [src/hooks/useCostMetrics.ts](/Users/yugangcao/apps/my-apps/cc-statistics/src/hooks/useCostMetrics.ts)
- any future cost display

### UI Surface Changes

v1 UI work should stay minimal:

- current cost pages continue to show derived totals
- Settings gets a manual pricing refresh control and refresh status
- optional debug metadata may appear only in Settings, not in the main cost views

## Error Handling

### Provider-Level Failures

If one provider refresh fails:

- keep previous cached entries for that provider if they exist
- mark provider catalog as stale or error
- continue resolving all other providers normally

### Model-Level Failures

If a specific model cannot be matched to an official price:

- try the next fallback layer
- do not block the rest of the session or page

### No-Match Behavior

If a model cannot be matched at any higher layer:

- use OpenRouter if available
- otherwise use local fallback

Unknown or synthetic models should still remain zero-cost if that is the current safety behavior for those buckets.

## Testing

### Rust Adapter Tests

Add fixture-driven tests for:

- official API parsing
- official doc HTML parsing
- OpenRouter fallback mapping
- cache read/write behavior
- stale-cache preservation on refresh failure

### Resolver Tests

Extend [src/lib/costing.test.ts](/Users/yugangcao/apps/my-apps/cc-statistics/src/lib/costing.test.ts) and [src/lib/modelPricing.ts](/Users/yugangcao/apps/my-apps/cc-statistics/src/lib/modelPricing.ts) coverage for:

- billing provider vs upstream provider routing
- tool-style provider priority over upstream price
- route-style provider priority over OpenRouter fallback
- alias matching
- ambiguity fallback behavior
- `app_source:model` custom override priority

### Page-Level Consistency Tests

Update [src/pages/cost-pages.test.tsx](/Users/yugangcao/apps/my-apps/cc-statistics/src/pages/cost-pages.test.tsx) so the same filtered sessions still produce identical totals across:

- Dashboard
- Cost Breakdown
- Sessions
- Report

Add cases where the same raw model appears under different `source` values and resolves to different price authorities.

## Files Expected To Change

- `src-tauri/src/pricing_providers.rs`
- `src-tauri/src/pricing_cache.rs`
- `src-tauri/src/commands.rs`
- `src-tauri/src/lib.rs`
- `src/stores/pricingStore.ts`
- `src/lib/modelPricing.ts`
- `src/lib/costing.ts`
- `src/lib/costing.test.ts`
- `src/hooks/useCostMetrics.ts`
- `src/components/pages/SettingsPage.tsx`
- `src/locales/en.json`
- `src/locales/zh.json`
- `src/locales/ja.json`

Additional small test or type changes are expected, but the implementation should remain centered on the files above.

## Rollout Notes

This spec intentionally keeps one cost authority in the UI while replacing the dynamic pricing source underneath it.

That means the implementation should be staged as:

1. backend catalog acquisition
2. frontend store migration from OpenRouter-only to catalog-backed pricing
3. resolver upgrade for billing-provider-aware matching
4. regression coverage for cross-page cost consistency

This staging keeps the risk manageable and matches the current architecture better than a full backend cost rewrite.
