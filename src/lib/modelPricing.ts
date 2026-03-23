import type { ModelPricing } from '../stores/settingsStore';

export interface PricingCandidate {
  id: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
}

export type PricingSource = 'custom' | 'dynamic' | 'fallback' | 'unknown';

export interface PricingContext {
  customPricingEnabled: boolean;
  customPricing: Record<string, ModelPricing>;
  dynamicPricing: readonly PricingCandidate[];
  fallbackPricing?: PricingCandidate;
}

export interface ResolvedPricing extends PricingCandidate {
  source: PricingSource;
  matchedModel: string | null;
}

export const FALLBACK_PRICING: PricingCandidate = {
  id: 'fallback',
  input: 3,
  output: 15,
  cacheRead: 0.3,
  cacheCreation: 3.75,
};

const UNKNOWN_MODEL_NAMES = new Set([
  '',
  'unknown',
  'unknown_model',
  'unknown-model',
  'unknownmodel',
  'n/a',
  'na',
  'none',
  'null',
  'undefined',
]);

const MODEL_PREFIX_RE = /^models?\//;
const BRACKET_SUFFIX_RE = /\[[^\]]*]/g;
const TRAILING_DATE_RE = /-\d{8}$/;
const TRAILING_VARIANT_RE = /[:@].*$/;
const SEPARATOR_RE = /[_.]+/g;
const MULTI_DASH_RE = /-+/g;

export function normalizeModelName(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(BRACKET_SUFFIX_RE, '')
    .replace(TRAILING_VARIANT_RE, '')
    .replace(MODEL_PREFIX_RE, '')
    .replace(/\s+/g, '')
    .replace(SEPARATOR_RE, '-')
    .replace(MULTI_DASH_RE, '-')
    .replace(TRAILING_DATE_RE, '')
    .replace(/\/+$/, '')
    .replace(/^-|-$/g, '');

  const slashIndex = normalized.indexOf('/');
  return slashIndex >= 0 ? normalized.slice(slashIndex + 1) : normalized;
}

function isUnknownModel(name: string): boolean {
  const normalized = normalizeModelName(name);
  return UNKNOWN_MODEL_NAMES.has(normalized);
}

function findExactCandidate(query: string, candidates: readonly PricingCandidate[]): PricingCandidate | null {
  return candidates.find((candidate) => candidate.id === query) ?? null;
}

function findNormalizedCandidate(query: string, candidates: readonly PricingCandidate[]): PricingCandidate | null {
  const normalizedQuery = normalizeModelName(query);
  return candidates.find((candidate) => normalizeModelName(candidate.id) === normalizedQuery) ?? null;
}

function findUniqueSubstringCandidate(query: string, candidates: readonly PricingCandidate[]): PricingCandidate | null {
  const normalizedQuery = normalizeModelName(query);
  if (!normalizedQuery) return null;

  const matches = candidates.filter((candidate) => normalizeModelName(candidate.id).includes(normalizedQuery));
  return matches.length === 1 ? matches[0] : null;
}

function toResolved(candidate: PricingCandidate, source: Exclude<PricingSource, 'unknown'>, matchedModel: string): ResolvedPricing {
  return {
    source,
    matchedModel,
    input: candidate.input,
    output: candidate.output,
    cacheRead: candidate.cacheRead,
    cacheCreation: candidate.cacheCreation,
    id: candidate.id,
  };
}

function toCustomCandidate(id: string, pricing: ModelPricing): PricingCandidate {
  return {
    id,
    input: pricing.input,
    output: pricing.output,
    cacheRead: pricing.cacheRead,
    cacheCreation: pricing.cacheCreation,
  };
}

function toDynamicCandidate(candidate: PricingCandidate): PricingCandidate {
  return {
    id: candidate.id,
    input: candidate.input,
    output: candidate.output,
    cacheRead: candidate.cacheRead,
    cacheCreation: candidate.cacheCreation,
  };
}

export function resolveModelPricing(model: string, context: PricingContext): ResolvedPricing {
  if (isUnknownModel(model)) {
    return {
      source: 'unknown',
      matchedModel: null,
      id: model,
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheCreation: 0,
    };
  }

  const fallbackPricing = context.fallbackPricing ?? FALLBACK_PRICING;
  const customCandidates = context.customPricingEnabled
    ? Object.entries(context.customPricing).map(([id, pricing]) => toCustomCandidate(id, pricing))
    : [];

  const exactCustomMatch = findExactCandidate(model, customCandidates);
  if (exactCustomMatch) {
    return toResolved(exactCustomMatch, 'custom', exactCustomMatch.id);
  }

  const normalizedCustomMatch = findNormalizedCandidate(model, customCandidates);
  if (normalizedCustomMatch) {
    return toResolved(normalizedCustomMatch, 'custom', normalizedCustomMatch.id);
  }

  const dynamicCandidates = context.dynamicPricing.map((candidate) => toDynamicCandidate(candidate));
  const exactDynamicMatch = findExactCandidate(model, dynamicCandidates);
  if (exactDynamicMatch) {
    return toResolved(exactDynamicMatch, 'dynamic', exactDynamicMatch.id);
  }

  const normalizedDynamicMatch = findNormalizedCandidate(model, dynamicCandidates);
  if (normalizedDynamicMatch) {
    return toResolved(normalizedDynamicMatch, 'dynamic', normalizedDynamicMatch.id);
  }

  const substringDynamicMatch = findUniqueSubstringCandidate(model, dynamicCandidates);
  if (substringDynamicMatch) {
    return toResolved(substringDynamicMatch, 'dynamic', substringDynamicMatch.id);
  }

  return {
    source: 'fallback',
    matchedModel: fallbackPricing.id,
    ...fallbackPricing,
  };
}
