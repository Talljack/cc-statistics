import { create } from 'zustand';
import type { ActiveTimeRange } from '../lib/timeRanges';
import { useSettingsStore } from './settingsStore';

interface FilterStore {
  selectedProject: string | null;
  activeTimeRange: ActiveTimeRange;
  selectedProvider: string | null;
  setProject: (project: string | null) => void;
  setActiveTimeRange: (range: ActiveTimeRange) => void;
  setProvider: (provider: string | null) => void;
}

export const useFilterStore = create<FilterStore>((set) => ({
  selectedProject: null,
  activeTimeRange: useSettingsStore.getState().defaultTimeRange,
  selectedProvider: null,
  setProject: (project) => set({ selectedProject: project }),
  setActiveTimeRange: (range) => set({ activeTimeRange: range }),
  setProvider: (provider) => set({ selectedProvider: provider }),
}));
