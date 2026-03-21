import { create } from 'zustand';
import type { TimeFilter } from '../types/statistics';
import { useSettingsStore } from './settingsStore';

interface FilterStore {
  selectedProject: string | null;
  timeFilter: TimeFilter;
  selectedProvider: string | null;
  _initialized: boolean;
  setProject: (project: string | null) => void;
  setTimeFilter: (filter: TimeFilter) => void;
  setProvider: (provider: string | null) => void;
}

export const useFilterStore = create<FilterStore>((set) => ({
  selectedProject: null,
  timeFilter: useSettingsStore.getState().defaultTimeFilter,
  selectedProvider: null,
  _initialized: false,
  setProject: (project) => set({ selectedProject: project }),
  setTimeFilter: (filter) => set({ timeFilter: filter }),
  setProvider: (provider) => set({ selectedProvider: provider }),
}));
