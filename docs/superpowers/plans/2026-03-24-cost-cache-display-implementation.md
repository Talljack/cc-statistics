# Cost Breakdown Cache Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep app-wide cost totals billable-only while showing cache token/value insight on the Cost Breakdown page without counting cache value into total.

**Architecture:** Extend the shared frontend cost derivation layer so it emits two independent result sets: billable cost and cache insight. Reuse that one hook across pages, update the Cost Breakdown UI to explain cache exclusion, and keep Dashboard/tray/report/session totals on the existing billable-only path.

**Tech Stack:** React, TypeScript, Zustand, React Query, Vitest, Testing Library

---

## File Map

- Modify: `src/lib/costing.ts`
  - Extend derived metric types with cache token totals and cache dollar totals.
- Modify: `src/hooks/useCostMetrics.ts`
  - Keep the shared hook API in sync with the new derived outputs.
- Modify: `src/lib/i18n.ts`
  - Add minimal placeholder interpolation support for localized cache copy if needed.
- Modify: `src/lib/costing.test.ts`
  - Cover cache-only, mixed billable+cache, and unknown-model behavior.
- Modify: `src/pages/CostBreakdown.tsx`
  - Render cache explanation copy and cache-only detail without polluting billable total math.
- Modify: `src/pages/cost-pages.test.tsx`
  - Assert the new cost-page messaging and that dashboard/tray totals remain billable-only.
- Modify: `src/locales/en.json`
- Modify: `src/locales/zh.json`
- Modify: `src/locales/ja.json`
  - Add copy for cache explanation labels.

## Task 1: Extend Shared Cost Derivation

**Files:**
- Modify: `src/lib/costing.ts`
- Modify: `src/hooks/useCostMetrics.ts`
- Test: `src/lib/costing.test.ts`

- [ ] **Step 1: Write failing unit tests for cache insight outputs**

Add tests that expect:

```ts
expect(result.totalCost).toBe(0);
expect(result.cacheTokens.total).toBe(750_000);
expect(result.cacheCost.read).toBeCloseTo(15);
expect(result.cacheCost.creation).toBeCloseTo(10);
expect(result.cacheCost.total).toBeCloseTo(25);
```

And a mixed session case:

```ts
expect(result.totalCost).toBeCloseTo(11);
expect(result.cacheCost.total).toBeCloseTo(33);
expect(result.costByType.input + result.costByType.output).toBeCloseTo(result.totalCost);
expect(result.costBySession[0].totalCost).toBeCloseTo(11);
expect(result.costByModel['anthropic/claude-sonnet-4-5']).toBeCloseTo(/* billable only */);
```

Add an explicit missing-pricing case:

```ts
expect(result.cacheTokens.total).toBe(500_000);
expect(result.cacheCost.total).toBe(0);
```

Add an explicit unknown-model cache case:

```ts
expect(result.cacheTokens.total).toBe(1_000_000);
expect(result.cacheCost.total).toBe(0);
expect(result.costByModel.unknown).toBe(0);
```

- [ ] **Step 2: Run unit tests to verify failure**

Run: `pnpm vitest src/lib/costing.test.ts`

Expected: FAIL because `cacheTokens` / `cacheCost` do not exist yet.

- [ ] **Step 3: Implement minimal shared derivation changes**

Update `src/lib/costing.ts` to add:

```ts
export interface DerivedCacheTokens {
  read: number;
  creation: number;
  total: number;
}

export interface DerivedCacheCost {
  read: number;
  creation: number;
  total: number;
}
```

Inside derivation:

```ts
const cacheReadCost = (tokens.cache_read / 1_000_000) * pricing.cacheRead;
const cacheCreationCost = (tokens.cache_creation / 1_000_000) * pricing.cacheCreation;
```

Aggregate these separately while keeping:

```ts
totalCost += inputCost + outputCost;
```

Do not add cache values into `totalCost` or `costByType`.

- [ ] **Step 4: Keep hook contract aligned**

Ensure `src/hooks/useCostMetrics.ts` continues to return the full derived result object unchanged except for exposing the new fields through the shared hook.

- [ ] **Step 5: Run unit tests to verify pass**

Run: `pnpm vitest src/lib/costing.test.ts`

Expected: PASS

- [ ] **Step 6: Commit Task 1**

```bash
git add src/lib/costing.ts src/hooks/useCostMetrics.ts src/lib/costing.test.ts
git commit -m "feat: derive cache insight separately from billable cost"
```

## Task 2: Update Cost Breakdown Copy and Rendering

**Files:**
- Modify: `src/pages/CostBreakdown.tsx`
- Modify: `src/locales/en.json`
- Modify: `src/locales/zh.json`
- Modify: `src/locales/ja.json`
- Test: `src/pages/cost-pages.test.tsx`

- [ ] **Step 1: Write failing page tests for cache explanation**

Add a Cost Breakdown test case that expects:

```ts
expect(screen.getByRole('heading', { level: 2 }).textContent).toContain('$3.50'); // title total only
expect(screen.getAllByText(/not included in total/i).length).toBe(2);
expect(screen.getByText(/cache read/i)).toBeInTheDocument();
expect(screen.getByText(/cache creation/i)).toBeInTheDocument();
expect(screen.getByText('$15.00')).toBeInTheDocument(); // cache read amount
expect(screen.getByText('$10.00')).toBeInTheDocument(); // cache creation amount
expect(screen.queryByTestId('cost-type-segment-cache_read')).not.toBeInTheDocument();
expect(screen.queryByTestId('cost-type-segment-cache_creation')).not.toBeInTheDocument();
```

For `zh`, assert the combined copy is rendered from translation keys instead of hardcoding.

Add a cache-only page-state test that expects:

```ts
expect(screen.queryByText(/no cost data/i)).not.toBeInTheDocument();
expect(screen.getAllByText(/not included in total/i).length).toBe(2);
expect(screen.getByRole('heading', { level: 2 }).textContent).toContain('$0.00');
```

- [ ] **Step 2: Run page tests to verify failure**

Run: `pnpm vitest src/pages/cost-pages.test.tsx`

Expected: FAIL because the page does not render cache explanation copy yet.

- [ ] **Step 3: Add translation keys**

Add locale strings for:

```json
"cost.cachedNotIncluded": "Cached {tokens} / Not included in total"
"cost.notIncludedInTotal": "Not included in total"
"cost.cacheValue": "Cache value"
```

Use natural equivalents in `zh` and `ja`.

If the current translation helper cannot interpolate `{tokens}`, add the smallest backward-compatible enhancement in `src/lib/i18n.ts` so `t(key, { tokens: ... })` replaces placeholders without changing existing callers.

- [ ] **Step 4: Implement Cost Breakdown cache rows**

Update `src/pages/CostBreakdown.tsx` so the type section behaves as:

- input/output rows keep amount + percentage
- cache read row renders its own token explanation + cache read amount
- cache creation row renders its own token explanation + cache creation amount
- billable stacked bar widths stay based only on billable total

Suggested render shape:

```tsx
<span>{t('cost.cachedNotIncluded', { tokens: formatTokens(cacheTokens) })}</span>
<span>{formatCost(cacheCost)}</span>
```

The section must still render cache insight even when billable total is `0`. Replace the current all-or-nothing `noTypeData` behavior with logic that:

- shows the empty billable bar state when `totalCost === 0`
- still renders cache read/cache creation rows if cache tokens exist

Do not add cache amount into title total or percentage math.

Keep the model section unchanged in scope:

- `costByModel` ranking and displayed money remain billable-only
- displayed total token count may still include cache tokens
- do not introduce a per-model cache sub-row in this pass

- [ ] **Step 5: Run page tests to verify pass**

Run: `pnpm vitest src/pages/cost-pages.test.tsx`

Expected: PASS

- [ ] **Step 6: Commit Task 2**

```bash
git add src/pages/CostBreakdown.tsx src/pages/cost-pages.test.tsx src/locales/en.json src/locales/zh.json src/locales/ja.json
git commit -m "feat: explain cached usage on cost breakdown"
```

## Task 3: Integrate and Verify App-Wide Billable Totals

**Files:**
- Review: `src/pages/Dashboard.tsx`
- Review: `src/pages/Report.tsx`
- Review: `src/pages/Sessions.tsx`
- Test: `src/lib/costing.test.ts`
- Test: `src/pages/cost-pages.test.tsx`

- [ ] **Step 1: Confirm dashboard and tray code still use billable total**

Verify `src/pages/Dashboard.tsx` still reads:

```ts
const displayCost = costMetrics.totalCost;
```

And tray sync still passes:

```ts
costUsd: derivedTodayCost
```

where `derivedTodayCost` remains `deriveCostMetrics(...).totalCost`.

- [ ] **Step 2: Adjust code only if integration drift exists**

If any page accidentally starts consuming `cacheCost.total` in a total surface, correct it so:

- Dashboard total stays billable-only
- Report totals stay billable-only
- Sessions table stays billable-only

- [ ] **Step 3: Run targeted verification**

Run:

```bash
pnpm vitest src/lib/costing.test.ts src/pages/cost-pages.test.tsx
```

Expected: PASS

Before running, extend `src/pages/cost-pages.test.tsx` fixture data so Dashboard, Report, Sessions, and tray assertions all include cache-bearing sessions and still expect the same billable-only totals.

- [ ] **Step 4: Run broader check if targeted tests pass**

Run:

```bash
pnpm test
```

Expected: PASS or clearly understood pre-existing failures only.

- [ ] **Step 5: Commit integration verification if code changed**

```bash
git add src/pages/Dashboard.tsx src/pages/Report.tsx src/pages/Sessions.tsx
git commit -m "test: keep billable totals consistent across cost surfaces"
```

Skip this commit if no source files changed in this task.
