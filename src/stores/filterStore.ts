import { create } from 'zustand';
import type { ActiveTimeRange } from '../lib/timeRanges';
import { useSettingsStore } from './settingsStore';

interface FilterStore {
  selectedProjects: string[];
  activeTimeRange: ActiveTimeRange;
  selectedProviders: string[];
  setProjects: (projects: string[]) => void;
  setActiveTimeRange: (range: ActiveTimeRange) => void;
  setProviders: (providers: string[]) => void;
}

export const useFilterStore = create<FilterStore>((set) => ({
  selectedProjects: [],
  activeTimeRange: useSettingsStore.getState().defaultTimeRange,
  selectedProviders: [],
  setProjects: (projects) => set({ selectedProjects: projects }),
  setActiveTimeRange: (range) => set({ activeTimeRange: range }),
  setProviders: (providers) => set({ selectedProviders: providers }),
}));
