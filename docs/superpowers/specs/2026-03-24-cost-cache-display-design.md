# Cost Breakdown Cache Display — Design Spec

## Overview

Clarify the app's cost presentation so users can distinguish billable cost from cached token activity.

The app should keep one canonical billable total:

- total cost includes only input and output token charges
- cache read and cache creation amounts are computed and displayed separately
- cache amounts never contribute to the displayed total on Dashboard, Cost Breakdown, Report, Sessions, or tray

The Cost Breakdown page should explicitly explain cached usage with the product copy:

- `已缓存 {X tokens} / 未计入 total`

Homepage cost stays simple and continues to show only the total billable cost.

## Problem

The current UI shows very large token totals while the displayed dollar total remains small. This is often correct numerically because:

- token totals include cache tokens
- displayed cost only includes billable input/output tokens

What is missing is product clarity. Users currently have no direct explanation that cached tokens can be large, can have an estimated price, and still must not be counted into the total.

## Goals

- preserve one billable total across the app
- show cache token usage and cache estimated value on the Cost Breakdown page
- make it explicit that cache value is not included in total
- keep Dashboard and tray cost displays simple
- avoid introducing a second competing cost authority

## Non-Goals

- changing token aggregation
- changing model pricing sources or matching order
- adding cache messaging to Dashboard, Sessions, or Report
- changing token charts outside the existing token analytics behavior

## Product Rules

### Canonical Total

Billable total remains:

`total = input_cost + output_cost`

where:

- `input_cost = input_tokens / 1_000_000 * input_price_per_m`
- `output_cost = output_tokens / 1_000_000 * output_price_per_m`

### Cache Insight

Cache value is derived separately:

- `cache_read_cost = cache_read_tokens / 1_000_000 * cache_read_price_per_m`
- `cache_creation_cost = cache_creation_tokens / 1_000_000 * cache_creation_price_per_m`

These values are display-only insights and must never be folded into:

- app total cost
- Cost Breakdown title total
- Dashboard cost card
- tray cost sync
- Report totals
- Sessions table cost

### User-Facing Copy

On the Cost Breakdown page, cached usage should be shown in human-readable form:

- `已缓存 {X tokens} / 未计入 total`

The cache amount should still be visible nearby as a separate money figure.

## Recommended Approach

Extend the existing shared frontend cost derivation layer instead of patching one page.

Why:

- the app already uses `useCostMetrics` as the UI-side cost authority
- Dashboard, Cost Breakdown, Sessions, and Report already depend on that shared derivation path
- this keeps total cost and cache insight consistent without another backend/frontend split

## Data Layer Changes

### `src/lib/costing.ts`

Expand derived metrics so the shared cost layer returns two independent families of values.

Billable values:

- `totalCost`
- `costByType.input`
- `costByType.output`
- `costByModel`
- `costBySession`

Cache insight values:

- `cacheTokens.read`
- `cacheTokens.creation`
- `cacheTokens.total`
- `cacheCost.read`
- `cacheCost.creation`
- `cacheCost.total`

Key rule:

- `costByType.cache_read` and `costByType.cache_creation` should no longer be treated as billable slices of the total bar math
- cache costs are derived and exposed separately from the billable breakdown

### `src/hooks/useCostMetrics.ts`

Keep the hook as the single shared entry point for page code.

Consumers should continue to read `costMetrics.totalCost` for billable total and gain new read-only access to:

- `costMetrics.cacheTokens`
- `costMetrics.cacheCost`

No page should recompute cache math on its own.

## UI Changes

### Dashboard

Dashboard remains intentionally simple.

- cost card continues to display `costMetrics.totalCost`
- no extra cache copy is added
- the existing token card continues to show total tokens, including cache tokens

This means Dashboard preserves the current compact layout while benefiting from the clarified cost logic.

### Tray Sync

Tray sync continues to use today's global billable total only.

- keep deriving tray `costUsd` from `deriveCostMetrics(...).totalCost`
- do not send cache-only amounts to tray stats

### Cost Breakdown Title

The page title total remains the billable total only.

- top-level total must stay equal to `costMetrics.totalCost`

### Cost Breakdown Type Section

The type section must separate billable slices from cache insight.

Input/output rows:

- display amount
- display percent of total
- participate in stacked bar widths

Cache read/cache creation rows:

- display `已缓存 {X tokens} / 未计入 total`
- display the separately computed cache dollar amount
- do not participate in total percent math
- do not contribute width to the stacked billable bar

This avoids visually implying that cache value is part of the paid total.

### Cost Breakdown Model Section

Keep model ranking based on billable cost only.

- sorting remains by billable model cost
- displayed money remains billable model cost
- displayed token total may continue to include cache tokens, because that section is still a usage-oriented model summary

No per-model cache sub-row is added in this pass.

### Sessions and Report

No new cache UI is added.

- continue showing billable derived cost only
- keep these views focused on comparable paid usage

## Edge Cases

- If a model has cache tokens but no cache pricing, cache tokens still display and cache amount becomes `$0.00`.
- If a session contains only cache tokens, total cost remains `0`, while cache insight may still be positive.
- If the model identifier is unknown, cache tokens may still count toward cache token totals, but cache amount should be `0` to avoid unsafe pricing guesses.
- If total billable cost is `0`, the billable stacked bar should remain empty while cache insight still renders as explanatory text.

## Testing

### Costing Unit Tests

Add coverage in `src/lib/costing.test.ts` for:

- cache cost derivation is calculated separately
- billable `totalCost` excludes cache cost
- cache-only sessions keep `totalCost === 0`
- cache token totals and cache dollar totals aggregate correctly across sessions/models

### Page Tests

Update `src/pages/cost-pages.test.tsx` for:

- Cost Breakdown showing the cache explanation copy
- Cost Breakdown title total excluding cache amount
- Dashboard and tray sync still using billable total only

## Files Expected To Change

- `src/lib/costing.ts`
- `src/lib/costing.test.ts`
- `src/hooks/useCostMetrics.ts`
- `src/pages/CostBreakdown.tsx`
- `src/pages/cost-pages.test.tsx`
- `src/locales/en.json`
- `src/locales/zh.json`
- `src/locales/ja.json`

Dashboard code may need a small update only if required to keep tray sync aligned with the clarified shared metrics, but no visible Dashboard UI expansion is intended.
