import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Language = 'zh' | 'en' | 'ja';
export type Theme = 'light' | 'dark' | 'system';

interface SettingsStore {
  // General
  language: Language;
  theme: Theme;
  showToolUsage: boolean;
  showSkillUsage: boolean;
  showMcpUsage: boolean;
  autoRefreshEnabled: boolean;
  autoRefreshInterval: number; // minutes

  // Actions
  setLanguage: (language: Language) => void;
  setTheme: (theme: Theme) => void;
  setShowToolUsage: (show: boolean) => void;
  setShowSkillUsage: (show: boolean) => void;
  setShowMcpUsage: (show: boolean) => void;
  setAutoRefreshEnabled: (enabled: boolean) => void;
  setAutoRefreshInterval: (interval: number) => void;
  resetSettings: () => void;
}

const defaultSettings = {
  language: 'zh' as Language,
  theme: 'dark' as Theme,
  showToolUsage: false,
  showSkillUsage: true,
  showMcpUsage: false,
  autoRefreshEnabled: false,
  autoRefreshInterval: 5,
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      ...defaultSettings,
      setLanguage: (language) => set({ language }),
      setTheme: (theme) => set({ theme }),
      setShowToolUsage: (show) => set({ showToolUsage: show }),
      setShowSkillUsage: (show) => set({ showSkillUsage: show }),
      setShowMcpUsage: (show) => set({ showMcpUsage: show }),
      setAutoRefreshEnabled: (enabled) => set({ autoRefreshEnabled: enabled }),
      setAutoRefreshInterval: (interval) => set({ autoRefreshInterval: interval }),
      resetSettings: () => set(defaultSettings),
    }),
    {
      name: 'cc-statistics-settings',
    }
  )
);
