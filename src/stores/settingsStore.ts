import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TimeFilter } from '../types/statistics';

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

// All supported model pricing keys, grouped by provider
export interface CustomPricing {
  // Anthropic
  opus: ModelPricing;
  sonnet: ModelPricing;
  haiku: ModelPricing;
  // OpenAI
  gpt4o: ModelPricing;
  gpt41: ModelPricing;
  o3: ModelPricing;
  o4mini: ModelPricing;
  // Google
  gemini25pro: ModelPricing;
  gemini25flash: ModelPricing;
  // DeepSeek
  deepseekV3: ModelPricing;
  deepseekR1: ModelPricing;
  // Kimi (Moonshot)
  kimiK2: ModelPricing;
  // GLM (Zhipu)
  glm4: ModelPricing;
  // Default fallback
  default: ModelPricing;
}

// Provider grouping metadata for UI
export interface ProviderGroup {
  provider: string;
  models: { key: keyof CustomPricing; label: string }[];
}

export const providerGroups: ProviderGroup[] = [
  {
    provider: 'Anthropic',
    models: [
      { key: 'opus', label: 'Claude Opus 4.5/4.6' },
      { key: 'sonnet', label: 'Claude Sonnet 4/4.5/4.6' },
      { key: 'haiku', label: 'Claude Haiku 4.5' },
    ],
  },
  {
    provider: 'OpenAI',
    models: [
      { key: 'gpt4o', label: 'GPT-4o' },
      { key: 'gpt41', label: 'GPT-4.1' },
      { key: 'o3', label: 'o3' },
      { key: 'o4mini', label: 'o4-mini' },
    ],
  },
  {
    provider: 'Google',
    models: [
      { key: 'gemini25pro', label: 'Gemini 2.5 Pro' },
      { key: 'gemini25flash', label: 'Gemini 2.5 Flash' },
    ],
  },
  {
    provider: 'DeepSeek',
    models: [
      { key: 'deepseekV3', label: 'DeepSeek V3' },
      { key: 'deepseekR1', label: 'DeepSeek R1' },
    ],
  },
  {
    provider: 'Moonshot',
    models: [
      { key: 'kimiK2', label: 'Kimi K2/K2.5' },
    ],
  },
  {
    provider: 'Zhipu',
    models: [
      { key: 'glm4', label: 'GLM-4.7/4.5' },
    ],
  },
  {
    provider: '',
    models: [
      { key: 'default', label: 'Default (Unknown)' },
    ],
  },
];

export interface CustomTimeFilter {
  label: string;
  days: number;
}

export interface CustomProvider {
  name: string;     // Display name (e.g., "Fireworks AI")
  keyword: string;  // Model name prefix to match (e.g., "fireworks")
}

interface SettingsStore {
  // General
  language: Language;
  theme: Theme;
  defaultTimeFilter: TimeFilter;
  showCost: boolean;
  showToolUsage: boolean;
  showSkillUsage: boolean;
  showMcpUsage: boolean;
  autoRefreshEnabled: boolean;
  autoRefreshInterval: number;

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

  // Advanced - Custom pricing
  customPricingEnabled: boolean;
  customPricing: CustomPricing;

  // Custom time filters
  customTimeFilters: CustomTimeFilter[];

  // Custom providers
  customProviders: CustomProvider[];

  // Actions
  setLanguage: (language: Language) => void;
  setTheme: (theme: Theme) => void;
  setDefaultTimeFilter: (filter: TimeFilter) => void;
  setShowCost: (show: boolean) => void;
  setShowToolUsage: (show: boolean) => void;
  setShowSkillUsage: (show: boolean) => void;
  setShowMcpUsage: (show: boolean) => void;
  setAutoRefreshEnabled: (enabled: boolean) => void;
  setAutoRefreshInterval: (interval: number) => void;
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
  setCustomPricing: (pricing: CustomPricing) => void;
  updateModelPricing: (model: keyof CustomPricing, pricing: Partial<ModelPricing>) => void;
  setCustomTimeFilters: (filters: CustomTimeFilter[]) => void;
  addCustomTimeFilter: (filter: CustomTimeFilter) => void;
  removeCustomTimeFilter: (index: number) => void;
  addCustomProvider: (provider: CustomProvider) => void;
  removeCustomProvider: (index: number) => void;
  resetSettings: () => void;
}

// Official pricing (USD per million tokens) — last updated March 2026
// Sources:
//   Anthropic: https://platform.claude.com/docs/en/about-claude/pricing
//   OpenAI:    https://openai.com/api/pricing/
//   Google:    https://ai.google.dev/gemini-api/docs/pricing
//   DeepSeek:  https://api-docs.deepseek.com/quick_start/pricing
//   Moonshot:  https://platform.moonshot.ai/docs/pricing/chat
//   Zhipu:     https://open.bigmodel.cn/pricing
const defaultPricing: CustomPricing = {
  // Anthropic (cache_read = 0.1x input, cache_creation = 1.25x input)
  opus:   { input: 5,    output: 25,   cacheRead: 0.50,  cacheCreation: 6.25 },
  sonnet: { input: 3,    output: 15,   cacheRead: 0.30,  cacheCreation: 3.75 },
  haiku:  { input: 1,    output: 5,    cacheRead: 0.10,  cacheCreation: 1.25 },
  // OpenAI (no native cache pricing — set to input rate)
  gpt4o:  { input: 2.50, output: 10,   cacheRead: 1.25,  cacheCreation: 2.50 },
  gpt41:  { input: 2,    output: 8,    cacheRead: 0.50,  cacheCreation: 2 },
  o3:     { input: 2,    output: 8,    cacheRead: 0.50,  cacheCreation: 2 },
  o4mini: { input: 1.10, output: 4.40, cacheRead: 0.275, cacheCreation: 1.10 },
  // Google (context caching: read ~0.025x, write ~same as input)
  gemini25pro:   { input: 1.25, output: 10,   cacheRead: 0.315, cacheCreation: 1.25 },
  gemini25flash: { input: 0.15, output: 0.60, cacheRead: 0.0375, cacheCreation: 0.15 },
  // DeepSeek (90% cache discount)
  deepseekV3: { input: 0.28, output: 0.42, cacheRead: 0.028, cacheCreation: 0.28 },
  deepseekR1: { input: 0.55, output: 2.19, cacheRead: 0.055, cacheCreation: 0.55 },
  // Moonshot Kimi
  kimiK2: { input: 0.60, output: 2.50, cacheRead: 0.15, cacheCreation: 0.60 },
  // Zhipu GLM
  glm4: { input: 0.60, output: 2.20, cacheRead: 0.15, cacheCreation: 0.60 },
  // Default fallback (Sonnet pricing)
  default: { input: 3, output: 15, cacheRead: 0.30, cacheCreation: 3.75 },
};

const defaultSettings = {
  language: 'zh' as Language,
  theme: 'dark' as Theme,
  defaultTimeFilter: 'today' as TimeFilter,
  showCost: true,
  showToolUsage: false,
  showSkillUsage: true,
  showMcpUsage: false,
  autoRefreshEnabled: false,
  autoRefreshInterval: 5,
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
  customPricing: defaultPricing,
  customTimeFilters: [] as CustomTimeFilter[],
  customProviders: [] as CustomProvider[],
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      ...defaultSettings,
      setLanguage: (language) => set({ language }),
      setTheme: (theme) => set({ theme }),
      setDefaultTimeFilter: (filter) => set({ defaultTimeFilter: filter }),
      setShowCost: (show) => set({ showCost: show }),
      setShowToolUsage: (show) => set({ showToolUsage: show }),
      setShowSkillUsage: (show) => set({ showSkillUsage: show }),
      setShowMcpUsage: (show) => set({ showMcpUsage: show }),
      setAutoRefreshEnabled: (enabled) => set({ autoRefreshEnabled: enabled }),
      setAutoRefreshInterval: (interval) => set({ autoRefreshInterval: interval }),
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
      setCustomPricing: (pricing) => set({ customPricing: pricing }),
      updateModelPricing: (model, pricing) =>
        set((state) => ({
          customPricing: {
            ...state.customPricing,
            [model]: { ...state.customPricing[model], ...pricing },
          },
        })),
      setCustomTimeFilters: (filters) => set({ customTimeFilters: filters }),
      addCustomTimeFilter: (filter) =>
        set((state) => ({
          customTimeFilters: [...state.customTimeFilters, filter],
        })),
      removeCustomTimeFilter: (index) =>
        set((state) => ({
          customTimeFilters: state.customTimeFilters.filter((_, i) => i !== index),
        })),
      addCustomProvider: (provider) =>
        set((state) => ({
          customProviders: [...state.customProviders, provider],
        })),
      removeCustomProvider: (index) =>
        set((state) => ({
          customProviders: state.customProviders.filter((_, i) => i !== index),
        })),
      resetSettings: () => set(defaultSettings),
    }),
    {
      name: 'cc-statistics-settings',
    }
  )
);
