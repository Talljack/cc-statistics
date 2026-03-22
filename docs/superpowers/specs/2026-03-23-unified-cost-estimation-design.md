# Unified Cost Estimation Design

Date: 2026-03-23

## Context

The app currently exposes multiple cost views:

- dashboard cost card
- cost breakdown total
- cost by type
- cost by model
- cost by session
- sessions table cost
- report cost summaries

Those views do not all use the same cost source. Some paths use backend `cost_usd`, while `CostBreakdown` recomputes parts of the total on the frontend from dynamic pricing. This creates visible mismatches, especially for Codex. The current implementation also treats cache tokens as billable cost, which does not match the desired product behavior.

## Goal

Make every cost display in the application use one consistent estimated API-cost formula:

- estimate from token counts and model pricing
- include only input and output tokens
- exclude cache read cost
- exclude cache creation cost
- use the same price resolution logic everywhere

Under the same filters, all cost surfaces must agree:

- total cost
- cost by type
- cost by model
- cost by session
- dashboard/report/session-table totals

## Non-Goals

- changing token counting itself
- hiding cache tokens from token charts or token totals
- removing existing backend `cost_usd` fields in this pass
- introducing provider-specific billing quirks beyond model token pricing

## Product Rules

### Cost Formula

For each model:

`cost = input_tokens / 1_000_000 * input_price_per_m + output_tokens / 1_000_000 * output_price_per_m`

Cache tokens remain visible in token analytics, but contribute zero to cost:

- `cache_read_cost = 0`
- `cache_creation_cost = 0`

### Pricing Priority

Model pricing must resolve in this order:

1. user-configured model pricing from Settings
2. dynamic model pricing fetched into the pricing store
3. built-in fallback pricing

This order must be identical for every cost view.

### Consistency Rules

For any active filter state:

- `totalCost == sum(costByModel)`
- `totalCost == sum(costByType)`
- `dashboardCost == reportCost == costBreakdownTotal`
- session table cost values must sum to the same filtered total

## Options Considered

### Option 1: Keep mixed sources and patch the cost page

Only fix `CostBreakdown` so it matches the other pages.

Pros:

- smallest code change

Cons:

- leaves the app with multiple cost authorities
- easy to regress again
- does not satisfy whole-app consistency

### Option 2: Move all cost calculation into the backend

Send pricing configuration to Tauri and compute all cost values there.

Pros:

- single backend authority

Cons:

- dynamic pricing and custom pricing are already frontend-native
- larger refactor
- more coordination between UI settings and Tauri commands

### Option 3: Frontend-derived cost authority on top of normalized tokens

Keep backend token aggregation as-is, but compute all displayed costs from a single shared frontend derivation layer using current pricing configuration.

Pros:

- matches the existing dynamic/custom pricing architecture
- creates one cost authority for the UI
- avoids further drift between pages

Cons:

- backend `cost_usd` remains as a compatibility field for now

### Recommendation

Choose Option 3.

It fits the current architecture, satisfies whole-app consistency, and minimizes risk while still centralizing cost behavior.

## Architecture

### Shared Cost Derivation Layer

Add a new frontend module responsible for all displayed cost values. It should expose pure functions or a shared hook that derive:

- `totalCost`
- `costByType`
- `costByModel`
- `costBySession`

Inputs:

- `stats.tokens`
- `sessions`
- pricing context from settings and pricing store

Outputs must be the only source used by UI components for money values.

### Shared Pricing Resolution

Extract one reusable pricing resolver:

- exact custom pricing match first
- then dynamic pricing store lookup
- then fallback pricing

The resolver must normalize model names using the same matching logic everywhere.

### Session Cost Derivation

Session cost must be derived from session token details using the same pricing resolver. The UI must no longer trust backend `session.cost_usd` as the displayed truth.

This requires richer session data than the current `SessionInfo` shape exposes today.

Minimum new session payload requirements:

- session-level `input`
- session-level `output`
- session-level `cache_read`
- session-level `cache_creation`
- per-model token attribution for sessions that contain more than one model

Without per-session token detail, the frontend cannot make `bySession` and `Report` totals mathematically consistent with app-wide total cost.

### Type Cost Derivation

The type breakdown must be derived from the same by-model token data, but only:

- input cost
- output cost

It may still render cache rows for transparency, but those rows must always be zero-cost under the new policy.

## UI Surface Changes

### Dashboard

Replace direct `stats.cost_usd` display with shared derived `totalCost`.

### Cost Breakdown

Use shared derived values for:

- page total
- by type
- by model
- by session

This page must not recompute cost independently anymore.

### Sessions

Use derived session costs for:

- displayed cost
- cost sorting

### Report

Project and day-level cost totals must aggregate derived session costs, not backend `cost_usd`.

## Data Compatibility

Keep existing `cost_usd` fields in the API response for now to avoid broad backend churn. Treat them as legacy compatibility fields until a later cleanup pass. The frontend display layer becomes the source of truth immediately.

Extend session-facing data so the frontend can derive exact session cost:

- add token detail to `SessionInfo`
- preserve existing `cost_usd` temporarily for compatibility
- do not use the legacy field for displayed money values once the new path lands

## Edge Cases

- If a model has no custom or dynamic price, fallback pricing is used.
- If a session has tokens but no resolvable model name, fallback pricing is applied to the reported model identifier.
- If cache tokens exist without input/output tokens, session cost is zero.
- If token counts are zero, cost is zero regardless of model match.

## Testing Strategy

### Unit Tests

Add frontend tests for the new shared cost derivation layer covering:

- custom pricing override wins over dynamic pricing
- dynamic pricing wins over fallback
- cache tokens do not affect cost
- cost by type equals cost by model total
- derived session costs sum to total cost
- mixed-model session cost stays exact when multiple models appear in one session

### Integration Checks

Verify the following pages under the same filter state:

- dashboard
- cost breakdown
- sessions
- report

Expected result: all money totals match.

### Regression Scenarios

- Codex-only filter
- mixed providers
- custom model pricing enabled
- dynamic pricing available
- fallback pricing path

## Acceptance Criteria

- Every displayed cost in the app is derived from one shared frontend calculation path.
- Cache tokens contribute zero cost everywhere.
- Cost by type, by model, by session, dashboard total, and report total all agree.
- Price resolution always prefers custom pricing, then dynamic pricing, then fallback pricing.
- Existing token analytics remain unchanged.
