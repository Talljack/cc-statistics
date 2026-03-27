import type { ModelPricing } from '../stores/settingsStore';

export interface PricingCandidate {
  id: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
  billingProvider?: string;
  upstreamProvider?: string | null;
  aliasKeys?: string[];
  sourceKind?: string;
  resolvedFrom?: string | null;
}

export type PricingSource = 'custom' | 'dynamic' | 'fallback' | 'unknown';

export interface PricingContext {
  appSource?: string;
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

function sourceKindRank(sourceKind?: string): number {
  switch (sourceKind) {
    case 'official_api':
      return 0;
    case 'official_doc':
      return 1;
    case 'fallback_only':
      return 2;
    default:
      return 3;
  }
}

function selectBestCandidate(candidates: readonly PricingCandidate[]): PricingCandidate | null {
  return candidates
    .slice()
    .sort((left, right) => sourceKindRank(left.sourceKind) - sourceKindRank(right.sourceKind))[0] ?? null;
}

function findUniqueSubstringCandidate(query: string, candidates: readonly PricingCandidate[]): PricingCandidate | null {
  const normalizedQuery = normalizeModelName(query);
  if (!normalizedQuery) return null;

  const matches = candidates.filter((candidate) => {
    if (normalizeModelName(candidate.id).includes(normalizedQuery)) {
      return true;
    }
    return candidate.aliasKeys?.some((alias) => normalizeModelName(alias).includes(normalizedQuery)) ?? false;
  });
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
    billingProvider: candidate.billingProvider,
    upstreamProvider: candidate.upstreamProvider,
    aliasKeys: candidate.aliasKeys,
    sourceKind: candidate.sourceKind,
    resolvedFrom: candidate.resolvedFrom,
  };
}

function scopedCustomKey(scope: string, model: string): string {
  return `${scope}:${model}`;
}

function findCustomCandidate(
  query: string,
  candidates: readonly PricingCandidate[],
  scope?: string | null
): PricingCandidate | null {
  const normalizedQuery = normalizeModelName(query);
  const queryKey = scope ? scopedCustomKey(scope, query) : query;

  const exact = candidates.filter((candidate) => candidate.id === queryKey);
  if (exact.length > 0) {
    return exact[0];
  }

  return (
    candidates.find((candidate) => {
      const [candidateScope, ...rest] = candidate.id.split(':');
      const hasScope = rest.length > 0;
      const candidateModel = hasScope ? rest.join(':') : candidate.id;
      const scopeMatches = scope ? hasScope && candidateScope === scope : !hasScope;
      return scopeMatches && normalizeModelName(candidateModel) === normalizedQuery;
    }) ?? null
  );
}

function appSourceToBillingProvider(appSource?: string): string | null {
  switch (appSource) {
    case 'claude_code':
      return 'anthropic';
    case 'codex':
      return 'openai';
    case 'gemini':
      return 'google';
    case 'openrouter':
      return 'openrouter';
    case 'copilot':
      return 'copilot';
    case 'kimi_k2':
      return 'moonshot';
    case 'zai':
      return 'zai';
    case 'warp':
      return 'warp';
    case 'cursor':
      return 'cursor';
    case 'kimi':
      return 'kimi';
    case 'amp':
      return 'amp';
    case 'factory':
      return 'factory';
    case 'augment':
      return 'augment';
    case 'jetbrains_ai':
      return 'jetbrains_ai';
    case 'ollama_cloud':
      return 'ollama_cloud';
    case 'kiro':
      return 'kiro';
    default:
      return appSource ?? null;
  }
}

function classifyUpstreamProvider(model: string): string | null {
  const normalized = normalizeModelName(model);

  if (normalized.startsWith('claude')) return 'anthropic';
  if (
    normalized.startsWith('gpt') ||
    normalized.startsWith('o1') ||
    normalized.startsWith('o3') ||
    normalized.startsWith('o4') ||
    normalized.startsWith('chatgpt') ||
    normalized.startsWith('codex')
  ) {
    return 'openai';
  }
  if (normalized.startsWith('gemini')) return 'google';
  if (normalized.startsWith('deepseek')) return 'deepseek';
  if (normalized.startsWith('kimi') || normalized.startsWith('moonshot')) return 'moonshot';
  if (normalized.startsWith('glm')) return 'zai';
  if (
    normalized.startsWith('mistral') ||
    normalized.startsWith('codestral') ||
    normalized.startsWith('pixtral') ||
    normalized.startsWith('ministral')
  ) {
    return 'mistral';
  }
  if (normalized.startsWith('llama') || normalized.startsWith('meta-llama')) return 'meta';
  if (normalized.startsWith('qwen')) return 'qwen';
  if (normalized.startsWith('grok')) return 'xai';
  if (normalized.startsWith('command') || normalized.startsWith('cohere')) return 'cohere';
  if (normalized.startsWith('yi-')) return 'yi';
  if (normalized.startsWith('baichuan')) return 'baichuan';
  if (normalized.startsWith('doubao') || normalized.startsWith('bytedance')) return 'bytedance';
  if (normalized.startsWith('sensechat') || normalized.startsWith('sensetime')) return 'sensetime';
  if (normalized.startsWith('perplexity') || normalized.startsWith('pplx')) return 'perplexity';
  if (normalized.startsWith('minimax')) return 'minimax';
  if (normalized.startsWith('azure')) return 'openai';
  if (normalized.startsWith('stepfun')) return 'stepfun';
  if (normalized.startsWith('baidu')) return 'baidu';
  if (normalized.startsWith('tencent')) return 'tencent';
  if (normalized.startsWith('iflytek')) return 'iflytek';
  if (normalized.startsWith('internlm')) return 'internlm';
  if (normalized.startsWith('reka')) return 'reka';
  if (normalized.startsWith('nous') || normalized.startsWith('nousresearch')) return 'nous';
  return null;
}

function appSourceTrack(appSource?: string): 'router' | 'tool' | 'direct' {
  switch (appSource) {
    case 'openrouter':
      return 'router';
    case 'copilot':
    case 'warp':
    case 'cursor':
    case 'kimi':
    case 'amp':
    case 'factory':
    case 'augment':
    case 'jetbrains_ai':
    case 'kiro':
      return 'tool';
    default:
      return 'direct';
  }
}

function providerPriority(appSource?: string, upstreamProvider?: string | null): string[] {
  const billingProvider = appSourceToBillingProvider(appSource);
  const priority: string[] = [];

  switch (appSourceTrack(appSource)) {
    case 'router':
      if (upstreamProvider) priority.push(upstreamProvider);
      if (billingProvider) priority.push(billingProvider);
      break;
    case 'tool':
      if (billingProvider) priority.push(billingProvider);
      if (upstreamProvider) priority.push(upstreamProvider);
      break;
    case 'direct':
      if (billingProvider) priority.push(billingProvider);
      if (upstreamProvider) priority.push(upstreamProvider);
      priority.push('openrouter');
      break;
  }

  return [...new Set(priority.filter(Boolean))];
}

function candidateMatchesProvider(candidate: PricingCandidate, provider: string): boolean {
  return (
    candidate.billingProvider === provider ||
    candidate.upstreamProvider === provider ||
    candidate.resolvedFrom === provider
  );
}

function findDynamicCandidate(
  query: string,
  appSource: string | undefined,
  candidates: readonly PricingCandidate[]
): PricingCandidate | null {
  const normalizedQuery = normalizeModelName(query);
  const queryAliases = [normalizedQuery];
  const upstreamProvider = classifyUpstreamProvider(query);
  const priorities = providerPriority(appSource, upstreamProvider);
  const groups: PricingCandidate[][] = [];

  for (const provider of priorities) {
    const matches = candidates.filter((candidate) => candidateMatchesProvider(candidate, provider));
    if (matches.length > 0) {
      groups.push(matches);
    }
  }

  const providerAwareCandidates = new Set(groups.flat());
  const unscopedCandidates = candidates.filter((candidate) => !providerAwareCandidates.has(candidate));
  if (unscopedCandidates.length > 0) {
    groups.push(unscopedCandidates);
  }

  for (const group of groups) {
    const exact = group.filter((candidate) => candidate.id === query);
    if (exact.length > 0) {
      return selectBestCandidate(exact);
    }

    const normalized = group.filter((candidate) => {
      if (normalizeModelName(candidate.id) === normalizedQuery) {
        return true;
      }
      return candidate.aliasKeys?.some((alias) => normalizeModelName(alias) === normalizedQuery) ?? false;
    });
    if (normalized.length > 0) {
      return selectBestCandidate(normalized);
    }

    const alias = group.filter((candidate) =>
      candidate.aliasKeys?.some((candidateAlias) =>
        queryAliases.includes(normalizeModelName(candidateAlias))
      ) ?? false
    );
    if (alias.length > 0) {
      return selectBestCandidate(alias);
    }

    const substring = findUniqueSubstringCandidate(query, group);
    if (substring) {
      return substring;
    }
  }

  return null;
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

  const billingProvider = appSourceToBillingProvider(context.appSource);
  const customScopes = [context.appSource, billingProvider, null];
  for (const scope of customScopes) {
    const customMatch = findCustomCandidate(model, customCandidates, scope);
    if (customMatch) {
      return toResolved(customMatch, 'custom', customMatch.id);
    }
  }

  const dynamicCandidates = context.dynamicPricing.map((candidate) => toDynamicCandidate(candidate));
  const dynamicMatch = findDynamicCandidate(model, context.appSource, dynamicCandidates);
  if (dynamicMatch) {
    return toResolved(dynamicMatch, 'dynamic', dynamicMatch.id);
  }

  return {
    source: 'fallback',
    matchedModel: fallbackPricing.id,
    ...fallbackPricing,
  };
}
