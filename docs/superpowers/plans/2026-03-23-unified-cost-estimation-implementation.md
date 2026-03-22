# Unified Cost Estimation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every displayed cost in CC Statistics use one shared API-cost estimation path based on token counts and current pricing, excluding cache cost entirely while keeping Dashboard, Cost Breakdown, Sessions, and Report perfectly consistent.

**Architecture:** Extend the backend session payload so each session exposes per-model token detail, then add a single frontend cost derivation layer that resolves pricing and computes totals from session-level model buckets. Migrate every cost surface to consume that derived result instead of backend `cost_usd`, keeping token analytics unchanged and treating cache tokens as visible but zero-cost.

**Tech Stack:** Tauri 2, Rust, React 19, TypeScript, Zustand, TanStack Query, Vitest

---

## File Structure

- Create: `src/lib/modelPricing.ts`
- Create: `src/lib/costing.ts`
- Create: `src/lib/costing.test.ts`
- Create: `src/hooks/useCostMetrics.ts`
- Modify: `src-tauri/src/models.rs`
- Modify: `src-tauri/src/aggregation.rs`
- Modify: `src/types/statistics.ts`
- Modify: `src/stores/pricingStore.ts`
- Modify: `src/lib/utils.ts`
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/pages/CostBreakdown.tsx`
- Modify: `src/pages/Sessions.tsx`
- Modify: `src/pages/Report.tsx`

## Task 1: Extend Session Payload With Exact Token Detail

**Files:**
- Modify: `src-tauri/src/models.rs`
- Modify: `src-tauri/src/aggregation.rs`
- Modify: `src/types/statistics.ts`

- [ ] **Step 1: Add failing backend assertions for session token detail**

Extend the existing aggregator unit tests in `src-tauri/src/aggregation.rs` so they assert that `SessionInfo` now carries:

- raw `input`
- raw `output`
- raw `cache_read`
- raw `cache_creation`
- `tokens_by_model` with exact per-model token buckets

- [ ] **Step 2: Run the targeted Rust tests and verify failure**

Run: `cargo test --manifest-path src-tauri/Cargo.toml aggregation::tests -- --nocapture`

Expected: FAIL because `SessionInfo` does not expose session token detail yet.

- [ ] **Step 3: Add the new response shape in Rust**

Update `src-tauri/src/models.rs` to add a serializable session token payload.

Use concrete fields:

```rust
pub struct SessionInfo {
    pub session_id: String,
    pub project_name: String,
    pub timestamp: String,
    pub duration_ms: u64,
    pub duration_formatted: String,
    pub total_tokens: u64,
    pub instructions: u32,
    pub model: String,
    pub git_branch: String,
    pub cost_usd: f64,
    pub source: String,
    pub input: u64,
    pub output: u64,
    pub cache_read: u64,
    pub cache_creation: u64,
    pub tokens_by_model: HashMap<String, ModelTokens>,
}
```

- [ ] **Step 4: Populate the new fields in the shared aggregator**

Update `aggregate_session` / `aggregate_sessions` in `src-tauri/src/aggregation.rs` so session rows include:

- total session token fields
- exact `tokens.by_model` cloned into `SessionInfo.tokens_by_model`
- unchanged `total_tokens`

Do not change the filtering rules. This task is only about payload completeness.

- [ ] **Step 5: Mirror the new session shape in frontend types**

Update `src/types/statistics.ts` so `SessionInfo` matches the Rust response exactly.

- [ ] **Step 6: Re-run the targeted Rust tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml aggregation::tests -- --nocapture`

Expected: PASS

- [ ] **Step 7: Commit the session payload expansion**

```bash
git add src-tauri/src/models.rs src-tauri/src/aggregation.rs src/types/statistics.ts
git commit -m "feat: expose session token detail for cost derivation"
```

## Task 2: Build Shared Pricing Resolution And Cost Derivation

**Files:**
- Create: `src/lib/modelPricing.ts`
- Create: `src/lib/costing.ts`
- Create: `src/lib/costing.test.ts`
- Modify: `src/stores/pricingStore.ts`
- Modify: `src/lib/utils.ts`

- [ ] **Step 1: Add failing frontend tests for the new cost authority**

Create `src/lib/costing.test.ts` and cover:

- custom pricing beats dynamic pricing
- dynamic pricing beats fallback
- cache tokens produce zero cost
- `totalCost === sum(costByModel)`
- `totalCost === sum(costByType)`
- mixed-model session totals remain exact
- ambiguous substring matches fall back deterministically
- `unknown` model buckets stay at zero cost

- [ ] **Step 2: Run the new frontend tests and verify failure**

Run: `pnpm vitest run src/lib/costing.test.ts`

Expected: FAIL because the shared pricing and cost modules do not exist yet.

- [ ] **Step 3: Extract a shared model-pricing resolver**

Create `src/lib/modelPricing.ts` with:

- model normalization
- unique-substring match rule
- `unknown` sentinel handling
- one resolver function with this priority:
  1. custom pricing
  2. dynamic pricing
  3. fallback pricing

Use a concrete API such as:

```ts
export interface ResolvedPricing {
  input: number;
  output: number;
  source: 'custom' | 'dynamic' | 'fallback' | 'unknown';
}

export function resolveModelPricing(model: string, ctx: PricingContext): ResolvedPricing
```

- [ ] **Step 4: Implement the shared cost derivation module**

Create `src/lib/costing.ts` with pure functions that derive:

- `totalCost`
- `costByType`
- `costByModel`
- `costBySession`

from session-level token detail only.

Use concrete derived structures:

```ts
export interface DerivedCostByType {
  input: number;
  output: number;
  cache_read: number;
  cache_creation: number;
}

export interface DerivedSessionCost {
  key: string;
  totalCost: number;
}
```

Rules:

- use full precision internally
- only `input` and `output` contribute to cost
- `cache_read` and `cache_creation` must always derive to `0`

- [ ] **Step 5: Remove page-specific pricing math helpers**

Delete or stop using `calculateCustomCost` from `src/lib/utils.ts` once the new shared layer exists. Keep formatting helpers only.

- [ ] **Step 6: Re-run the frontend unit test**

Run: `pnpm vitest run src/lib/costing.test.ts`

Expected: PASS

- [ ] **Step 7: Commit the shared cost authority**

```bash
git add src/lib/modelPricing.ts src/lib/costing.ts src/lib/costing.test.ts src/stores/pricingStore.ts src/lib/utils.ts
git commit -m "feat: add shared cost derivation and pricing resolver"
```

## Task 3: Add A Shared Hook And Migrate Dashboard + Cost Breakdown

**Files:**
- Create: `src/hooks/useCostMetrics.ts`
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/pages/CostBreakdown.tsx`

- [ ] **Step 1: Add a failing frontend test for shared derived totals**

Extend `src/lib/costing.test.ts` or add a light hook test so one shared derived object can drive:

- dashboard total
- cost breakdown total
- cost by type
- cost by model

with equal raw totals.

- [ ] **Step 2: Run the targeted frontend test and verify failure**

Run: `pnpm vitest run src/lib/costing.test.ts`

Expected: FAIL because the pages still compute/display cost from different sources.

- [ ] **Step 3: Create a shared hook for page consumers**

Create `src/hooks/useCostMetrics.ts` that:

- reads `customPricingEnabled` and `customPricing`
- reads dynamic pricing from `usePricingStore`
- accepts `stats` and `sessions`
- returns one memoized derived result object

Suggested hook shape:

```ts
export function useCostMetrics(stats: Statistics | undefined, sessions: SessionInfo[] | undefined) {
  return {
    totalCost,
    costByType,
    costByModel,
    costBySession,
  };
}
```

- [ ] **Step 4: Migrate Dashboard**

Update `src/pages/Dashboard.tsx` so the cost card displays `useCostMetrics(...).totalCost`.

Stop using:

- `stats.cost_usd`
- `calculateCustomCost(...)`

- [ ] **Step 5: Migrate Cost Breakdown**

Update `src/pages/CostBreakdown.tsx` so:

- page total uses `totalCost`
- by type uses `costByType`
- by model uses `costByModel`
- by session uses `costBySession`

Delete the file-local `getDynamicModelPricing()` helper and any page-local cost recomputation.

- [ ] **Step 6: Re-run frontend tests**

Run: `pnpm vitest run`

Expected: PASS

- [ ] **Step 7: Commit the first page migration**

```bash
git add src/hooks/useCostMetrics.ts src/pages/Dashboard.tsx src/pages/CostBreakdown.tsx src/lib/costing.test.ts
git commit -m "feat: route dashboard and cost page through shared cost metrics"
```

## Task 4: Migrate Sessions + Report And Keep Sorting Consistent

**Files:**
- Modify: `src/pages/Sessions.tsx`
- Modify: `src/pages/Report.tsx`

- [ ] **Step 1: Add failing tests for session/report consistency**

Extend `src/lib/costing.test.ts` with cases that prove:

- session derived costs sum to `totalCost`
- report day/project rollups derived from sessions sum to `totalCost`
- session sorting by cost uses derived session cost, not stale backend `cost_usd`

- [ ] **Step 2: Run the targeted frontend tests and verify failure**

Run: `pnpm vitest run src/lib/costing.test.ts`

Expected: FAIL because `Sessions` and `Report` still use backend `cost_usd`.

- [ ] **Step 3: Migrate Sessions page**

Update `src/pages/Sessions.tsx` so:

- displayed cost comes from `costBySession`
- cost sort compares derived session cost
- render key stays `source + session_id`

Use a stable lookup key such as:

```ts
const key = `${session.source}:${session.session_id}`;
```

- [ ] **Step 4: Migrate Report page**

Update `src/pages/Report.tsx` so:

- overview total uses shared `totalCost`
- project leaderboard cost sums derived session costs
- daily trend cost sums derived session costs

Do not add any page-local pricing math.

- [ ] **Step 5: Re-run frontend tests**

Run: `pnpm vitest run`

Expected: PASS

- [ ] **Step 6: Commit the remaining page migration**

```bash
git add src/pages/Sessions.tsx src/pages/Report.tsx src/lib/costing.test.ts
git commit -m "feat: unify sessions and report cost calculations"
```

## Task 5: Verify End-To-End Consistency

**Files:**
- Modify: `src/lib/costing.test.ts` (if any final assertions are still missing)

- [ ] **Step 1: Run full frontend test suite**

Run: `pnpm test`

Expected: PASS

- [ ] **Step 2: Run backend compile check**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`

Expected: PASS

- [ ] **Step 3: Run production frontend build**

Run: `pnpm build`

Expected: PASS

- [ ] **Step 4: Run full Rust test suite**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -- --nocapture`

Expected: PASS

- [ ] **Step 5: Build the desktop app**

Run: `pnpm tauri build`

Expected: app bundle and dmg are produced; signing may still fail if `TAURI_SIGNING_PRIVATE_KEY` is not configured, but the build output must otherwise complete.

- [ ] **Step 6: Manual consistency checklist**

Under the same filter state, verify:

- Dashboard total cost
- Cost Breakdown total
- sum of Cost Breakdown by-model raw values
- sum of Cost Breakdown by-session raw values
- Sessions page displayed costs summed manually from the top rows as spot-check
- Report overview total

All must be derived from the same pricing snapshot and agree within raw precision.

- [ ] **Step 7: Commit verification-only follow-up if needed**

```bash
git add src/lib/costing.test.ts
git commit -m "test: cover unified cost estimation regressions"
```
