import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ActiveTimeRange, SavedTimeRange } from '../lib/timeRanges';

export type Language = 'zh' | 'en' | 'ja';
export type Theme = 'light' | 'dark' | 'system';
export type SessionSortField = 'timestamp' | 'cost_usd' | 'total_tokens' | 'duration_ms';
export type SortOrder = 'asc' | 'desc';

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
  enabledSources: { claude_code: boolean; codex: boolean; gemini: boolean; opencode: boolean; openclaw: boolean };

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
  toggleSource: (source: 'claude_code' | 'codex' | 'gemini' | 'opencode' | 'openclaw') => void;
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
  enabledSources: {
    claude_code: true,
    codex: true,
    gemini: true,
    opencode: true,
    openclaw: true,
  },
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
      resetSettings: () => set(defaultSettings),
    }),
    {
      name: 'cc-statistics-settings',
      // Migrate old settings shape
      migrate: (persisted: unknown) => {
        const state = persisted as Record<string, unknown>;
        // Migrate old defaultTimeFilter string → new defaultTimeRange object
        if (state && typeof state.defaultTimeFilter === 'string' && !state.defaultTimeRange) {
          const key = state.defaultTimeFilter as string;
          if (['today', 'week', 'month', 'all'].includes(key)) {
            state.defaultTimeRange = { kind: 'built_in', key };
          } else {
            state.defaultTimeRange = { kind: 'built_in', key: 'today' };
          }
          delete state.defaultTimeFilter;
        }
        // Migrate old customTimeFilters → savedTimeRanges
        if (state && Array.isArray(state.customTimeFilters) && state.customTimeFilters.length > 0 && (!state.savedTimeRanges || (state.savedTimeRanges as SavedTimeRange[]).length === 0)) {
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
        if (state && state.customPricing && typeof state.customPricing === 'object') {
          const oldKeys = ['opus', 'sonnet', 'haiku', 'gpt4o', 'gpt41', 'o3', 'o4mini',
            'gemini25pro', 'gemini25flash', 'deepseekV3', 'deepseekR1', 'kimiK2', 'glm4', 'default'];
          const pricing = state.customPricing as Record<string, unknown>;
          if (oldKeys.some(k => k in pricing)) {
            state.customPricing = {};
          }
        }
        return state as unknown as SettingsStore;
      },
      version: 2,
    }
  )
);
