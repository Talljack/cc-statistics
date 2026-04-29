import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ActiveTimeRange, SavedTimeRange } from '../lib/timeRanges';

export type Language = 'zh' | 'en' | 'ja';
export type Theme = 'light' | 'dark' | 'system';
export type SessionSortField = 'timestamp' | 'cost_usd' | 'total_tokens' | 'duration_ms';
export type SortOrder = 'asc' | 'desc';
export type SourceKind = 'claude_code' | 'codex' | 'gemini' | 'opencode' | 'openclaw' | 'hermes';
export type EnabledSources = Record<SourceKind, boolean>;

export interface ModelPricing {
  input: number;       // per million tokens
  output: number;      // per million tokens
  cacheRead: number;   // per million tokens
  cacheCreation: number; // per million tokens
}

export interface CustomProvider {
  name: string;     // Display name (e.g., "Fireworks AI")
  keyword: string;  // Model name prefix to match (e.g., "fireworks")
}

export interface SourceInstance {
  id: string;
  source: SourceKind;
  label: string;
  rootPath: string;
  enabled: boolean;
  builtIn: boolean;
}

export const SOURCE_KINDS: SourceKind[] = ['claude_code', 'codex', 'gemini', 'opencode', 'openclaw', 'hermes'];

export const DEFAULT_SOURCE_ROOTS: Record<SourceKind, string> = {
  claude_code: '~/.claude',
  codex: '~/.codex',
  gemini: '~/.gemini',
  opencode: '~/.local/share/opencode',
  openclaw: '~/.openclaw',
  hermes: '~/.hermes',
};

const DEFAULT_ENABLED_SOURCES: EnabledSources = {
  claude_code: true,
  codex: true,
  gemini: true,
  opencode: true,
  openclaw: true,
  hermes: true,
};

export function normalizeSourceRootPath(rootPath: string): string {
  const trimmed = rootPath.trim();
  if (!trimmed || trimmed === '/' || /^[A-Za-z]:[\\/]{0,1}$/.test(trimmed)) {
    return trimmed;
  }
  return trimmed.replace(/[\\/]+$/, '');
}

export function buildBuiltInSourceInstance(source: SourceKind): SourceInstance {
  return {
    id: `built-in:${source}`,
    source,
    label: 'Default',
    rootPath: DEFAULT_SOURCE_ROOTS[source],
    enabled: true,
    builtIn: true,
  };
}

export function buildDefaultSourceInstances(): SourceInstance[] {
  return SOURCE_KINDS.map(buildBuiltInSourceInstance);
}

function getSettingsStorage() {
  if (typeof window !== 'undefined' && window.localStorage && typeof window.localStorage.setItem === 'function') {
    return window.localStorage;
  }
  if (typeof localStorage !== 'undefined' && localStorage && typeof localStorage.setItem === 'function') {
    return localStorage;
  }
  return {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  };
}

function buildCustomSourceInstance(input: {
  source: SourceKind;
  rootPath: string;
  label?: string;
  enabled?: boolean;
}): SourceInstance {
  const normalizedPath = normalizeSourceRootPath(input.rootPath);
  const fallbackLabel = normalizedPath.split(/[\\/]/).filter(Boolean).pop() || 'Custom';

  return {
    id: crypto.randomUUID(),
    source: input.source,
    label: input.label?.trim() || fallbackLabel,
    rootPath: normalizedPath,
    enabled: input.enabled ?? true,
    builtIn: false,
  };
}

function hasDuplicateSourceRoot(
  instances: SourceInstance[],
  source: SourceKind,
  rootPath: string,
  excludeId?: string,
): boolean {
  const normalizedPath = normalizeSourceRootPath(rootPath);
  return instances.some((instance) => (
    instance.source === source
    && instance.id !== excludeId
    && normalizeSourceRootPath(instance.rootPath) === normalizedPath
  ));
}

export function migrateSettingsState(persisted: unknown): SettingsStore {
  const state = (persisted && typeof persisted === 'object'
    ? { ...(persisted as Record<string, unknown>) }
    : {}) as Record<string, unknown>;

  // Migrate old defaultTimeFilter string → new defaultTimeRange object
  if (typeof state.defaultTimeFilter === 'string' && !state.defaultTimeRange) {
    const key = state.defaultTimeFilter as string;
    if (['today', 'week', 'month', 'all'].includes(key)) {
      state.defaultTimeRange = { kind: 'built_in', key };
    } else {
      state.defaultTimeRange = { kind: 'built_in', key: 'today' };
    }
    delete state.defaultTimeFilter;
  }

  // Migrate old customTimeFilters → savedTimeRanges
  if (
    Array.isArray(state.customTimeFilters)
    && state.customTimeFilters.length > 0
    && (!state.savedTimeRanges || (state.savedTimeRanges as SavedTimeRange[]).length === 0)
  ) {
    state.savedTimeRanges = (state.customTimeFilters as Array<{ label: string; days: number }>).map((f, i) => ({
      id: crypto.randomUUID(),
      label: f.label || `Last ${f.days} Days`,
      kind: 'relative' as const,
      days: f.days,
      includeToday: true,
      showInHeader: i < 2,
      sortOrder: i,
    }));
    state.customTimeFilters = [];
  }

  // Migrate old customPricing keys (opus, sonnet, gpt4o, etc.) → clean slate
  if (state.customPricing && typeof state.customPricing === 'object') {
    const oldKeys = ['opus', 'sonnet', 'haiku', 'gpt4o', 'gpt41', 'o3', 'o4mini',
      'gemini25pro', 'gemini25flash', 'deepseekV3', 'deepseekR1', 'kimiK2', 'glm4', 'default'];
    const pricing = state.customPricing as Record<string, unknown>;
    if (oldKeys.some(k => k in pricing)) {
      state.customPricing = {};
    }
  }

  const instances = Array.isArray(state.sourceInstances)
    ? (state.sourceInstances as SourceInstance[])
        .map((instance) => ({
          ...instance,
          rootPath: normalizeSourceRootPath(instance.rootPath),
          label: instance.label?.trim() || 'Custom',
        }))
        .filter((instance) => (
          SOURCE_KINDS.includes(instance.source)
          && !!instance.rootPath
          && (instance.builtIn || !hasDuplicateSourceRoot(
            (state.sourceInstances as SourceInstance[]).filter((candidate) => candidate.id !== instance.id),
            instance.source,
            instance.rootPath,
          ))
        ))
    : [];

  const existingById = new Map(instances.map((instance) => [instance.id, instance]));
  const sourceInstances = buildDefaultSourceInstances().map((builtIn) => (
    existingById.get(builtIn.id)
      ? {
          ...builtIn,
          ...existingById.get(builtIn.id)!,
          source: builtIn.source,
          rootPath: normalizeSourceRootPath(existingById.get(builtIn.id)!.rootPath || builtIn.rootPath),
          builtIn: true,
        }
      : builtIn
  ));

  for (const instance of instances) {
    if (instance.builtIn || existingById.has(instance.id) === false) {
      continue;
    }
    if (!hasDuplicateSourceRoot(sourceInstances, instance.source, instance.rootPath)) {
      sourceInstances.push({
        ...instance,
        rootPath: normalizeSourceRootPath(instance.rootPath),
        label: instance.label?.trim() || 'Custom',
        builtIn: false,
      });
    }
  }

  state.enabledSources = {
    ...DEFAULT_ENABLED_SOURCES,
    ...(state.enabledSources as Partial<EnabledSources> | undefined),
  };
  state.sourceInstances = sourceInstances;

  return state as unknown as SettingsStore;
}

interface SettingsStore {
  // General
  language: Language;
  theme: Theme;
  defaultTimeRange: ActiveTimeRange;
  showCost: boolean;
  showToolUsage: boolean;
  showSkillUsage: boolean;
  showMcpUsage: boolean;
  autoRefreshEnabled: boolean;
  autoRefreshInterval: number;

  // Alerts
  alertsEnabled: boolean;
  dailyCostLimit: number;
  dailyTokenLimit: number;
  sessionWindowWarning: number;
  alertsMutedUntil: string | null;

  // Dashboard cards
  showSessionsCard: boolean;
  showInstructionsCard: boolean;
  showDurationCard: boolean;
  showTokensCard: boolean;
  showCostCard: boolean;
  showSkillsCard: boolean;
  showMcpCard: boolean;

  // Sessions
  sessionSortField: SessionSortField;
  sessionSortOrder: SortOrder;

  // Advanced - Custom pricing (keyed by model name, e.g. "claude-sonnet-4-5")
  customPricingEnabled: boolean;
  customPricing: Record<string, ModelPricing>;
  customPricingModels: string[];

  // Custom time ranges
  savedTimeRanges: SavedTimeRange[];

  // Custom providers
  customProviders: CustomProvider[];

  // Data sources
  enabledSources: EnabledSources;
  sourceInstances: SourceInstance[];

  // Actions
  setLanguage: (language: Language) => void;
  setTheme: (theme: Theme) => void;
  setDefaultTimeRange: (range: ActiveTimeRange) => void;
  setShowCost: (show: boolean) => void;
  setShowToolUsage: (show: boolean) => void;
  setShowSkillUsage: (show: boolean) => void;
  setShowMcpUsage: (show: boolean) => void;
  setAutoRefreshEnabled: (enabled: boolean) => void;
  setAutoRefreshInterval: (interval: number) => void;
  setAlertsEnabled: (enabled: boolean) => void;
  setDailyCostLimit: (limit: number) => void;
  setDailyTokenLimit: (limit: number) => void;
  setSessionWindowWarning: (pct: number) => void;
  setAlertsMutedUntil: (until: string | null) => void;
  setShowSessionsCard: (show: boolean) => void;
  setShowInstructionsCard: (show: boolean) => void;
  setShowDurationCard: (show: boolean) => void;
  setShowTokensCard: (show: boolean) => void;
  setShowCostCard: (show: boolean) => void;
  setShowSkillsCard: (show: boolean) => void;
  setShowMcpCard: (show: boolean) => void;
  setSessionSortField: (field: SessionSortField) => void;
  setSessionSortOrder: (order: SortOrder) => void;
  setCustomPricingEnabled: (enabled: boolean) => void;
  updateModelPricing: (model: string, pricing: Partial<ModelPricing>) => void;
  addSavedTimeRange: (range: SavedTimeRange) => void;
  updateSavedTimeRange: (id: string, range: SavedTimeRange) => void;
  removeSavedTimeRange: (id: string) => void;
  addCustomProvider: (provider: CustomProvider) => void;
  removeCustomProvider: (index: number) => void;
  toggleSource: (source: SourceKind) => void;
  addSourceInstance: (instance: {
    source: SourceKind;
    label?: string;
    rootPath: string;
    enabled?: boolean;
  }) => boolean;
  updateSourceInstance: (id: string, updates: Partial<Pick<SourceInstance, 'label' | 'rootPath' | 'enabled'>>) => boolean;
  removeSourceInstance: (id: string) => void;
  resetSettings: () => void;
}

const defaultSettings = {
  language: 'zh' as Language,
  theme: 'dark' as Theme,
  defaultTimeRange: { kind: 'built_in', key: 'today' } as ActiveTimeRange,
  showCost: true,
  showToolUsage: false,
  showSkillUsage: true,
  showMcpUsage: false,
  autoRefreshEnabled: false,
  autoRefreshInterval: 5,
  alertsEnabled: false,
  dailyCostLimit: 0,
  dailyTokenLimit: 0,
  sessionWindowWarning: 80,
  alertsMutedUntil: null as string | null,
  showSessionsCard: true,
  showInstructionsCard: true,
  showDurationCard: true,
  showTokensCard: true,
  showCostCard: true,
  showSkillsCard: false,
  showMcpCard: false,
  sessionSortField: 'timestamp' as SessionSortField,
  sessionSortOrder: 'desc' as SortOrder,
  customPricingEnabled: false,
  customPricing: {} as Record<string, ModelPricing>,
  // Model IDs for custom pricing — loaded from config file on first run, user can add/remove
  customPricingModels: [] as string[],
  savedTimeRanges: [] as SavedTimeRange[],
  customProviders: [] as CustomProvider[],
  enabledSources: DEFAULT_ENABLED_SOURCES,
  sourceInstances: buildDefaultSourceInstances(),
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      ...defaultSettings,
      setLanguage: (language) => set({ language }),
      setTheme: (theme) => set({ theme }),
      setDefaultTimeRange: (range) => set({ defaultTimeRange: range }),
      setShowCost: (show) => set({ showCost: show }),
      setShowToolUsage: (show) => set({ showToolUsage: show }),
      setShowSkillUsage: (show) => set({ showSkillUsage: show }),
      setShowMcpUsage: (show) => set({ showMcpUsage: show }),
      setAutoRefreshEnabled: (enabled) => set({ autoRefreshEnabled: enabled }),
      setAutoRefreshInterval: (interval) => set({ autoRefreshInterval: interval }),
      setAlertsEnabled: (enabled) => set({ alertsEnabled: enabled }),
      setDailyCostLimit: (limit) => set({ dailyCostLimit: limit }),
      setDailyTokenLimit: (limit) => set({ dailyTokenLimit: limit }),
      setSessionWindowWarning: (pct) => set({ sessionWindowWarning: pct }),
      setAlertsMutedUntil: (until) => set({ alertsMutedUntil: until }),
      setShowSessionsCard: (show) => set({ showSessionsCard: show }),
      setShowInstructionsCard: (show) => set({ showInstructionsCard: show }),
      setShowDurationCard: (show) => set({ showDurationCard: show }),
      setShowTokensCard: (show) => set({ showTokensCard: show }),
      setShowCostCard: (show) => set({ showCostCard: show }),
      setShowSkillsCard: (show) => set({ showSkillsCard: show }),
      setShowMcpCard: (show) => set({ showMcpCard: show }),
      setSessionSortField: (field) => set({ sessionSortField: field }),
      setSessionSortOrder: (order) => set({ sessionSortOrder: order }),
      setCustomPricingEnabled: (enabled) => set({ customPricingEnabled: enabled }),
      updateModelPricing: (model, pricing) =>
        set((state) => ({
          customPricing: {
            ...state.customPricing,
            [model]: { ...(state.customPricing[model] || { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 }), ...pricing },
          },
        })),
      addSavedTimeRange: (range) =>
        set((state) => ({
          savedTimeRanges: [...state.savedTimeRanges, range],
        })),
      updateSavedTimeRange: (id, range) =>
        set((state) => ({
          savedTimeRanges: state.savedTimeRanges.map((r) => (r.id === id ? range : r)),
        })),
      removeSavedTimeRange: (id) => {
        const state = get();
        const newRanges = state.savedTimeRanges.filter((r) => r.id !== id);
        const updates: Partial<SettingsStore> = { savedTimeRanges: newRanges };
        // If the deleted range was the default, fall back to Today
        if (state.defaultTimeRange.kind === 'custom' && state.defaultTimeRange.id === id) {
          updates.defaultTimeRange = { kind: 'built_in', key: 'today' };
        }
        set(updates);
      },
      addCustomProvider: (provider) =>
        set((state) => ({
          customProviders: [...state.customProviders, provider],
        })),
      removeCustomProvider: (index) =>
        set((state) => ({
          customProviders: state.customProviders.filter((_, i) => i !== index),
        })),
      toggleSource: (source) =>
        set((state) => ({
          enabledSources: {
            ...state.enabledSources,
            [source]: !state.enabledSources[source],
          },
        })),
      addSourceInstance: ({ source, rootPath, label, enabled }) => {
        const normalizedPath = normalizeSourceRootPath(rootPath);
        if (!normalizedPath) {
          return false;
        }

        const state = get();
        if (hasDuplicateSourceRoot(state.sourceInstances, source, normalizedPath)) {
          return false;
        }

        set({
          sourceInstances: [
            ...state.sourceInstances,
            buildCustomSourceInstance({ source, rootPath: normalizedPath, label, enabled }),
          ],
        });
        return true;
      },
      updateSourceInstance: (id, updates) => {
        const state = get();
        const existing = state.sourceInstances.find((instance) => instance.id === id);
        if (!existing) {
          return false;
        }

        const nextRootPath = updates.rootPath === undefined
          ? existing.rootPath
          : normalizeSourceRootPath(updates.rootPath);
        if (!nextRootPath) {
          return false;
        }
        if (hasDuplicateSourceRoot(state.sourceInstances, existing.source, nextRootPath, id)) {
          return false;
        }

        set({
          sourceInstances: state.sourceInstances.map((instance) => {
            if (instance.id !== id) {
              return instance;
            }

            return {
              ...instance,
              label: updates.label === undefined ? instance.label : (updates.label.trim() || instance.label),
              rootPath: instance.builtIn ? instance.rootPath : nextRootPath,
              enabled: updates.enabled ?? instance.enabled,
            };
          }),
        });
        return true;
      },
      removeSourceInstance: (id) =>
        set((state) => ({
          sourceInstances: state.sourceInstances.filter((instance) => instance.builtIn || instance.id !== id),
        })),
      resetSettings: () => set(defaultSettings),
    }),
    {
      name: 'cc-statistics-settings',
      storage: createJSONStorage(getSettingsStorage),
      migrate: migrateSettingsState,
      version: 3,
    }
  )
);
