import { create } from 'zustand';
import type { TimeFilter } from '../types/statistics';

interface FilterStore {
  selectedProject: string | null;
  timeFilter: TimeFilter;
  setProject: (project: string | null) => void;
  setTimeFilter: (filter: TimeFilter) => void;
}

export const useFilterStore = create<FilterStore>((set) => ({
  selectedProject: null,
  timeFilter: 'today',
  setProject: (project) => set({ selectedProject: project }),
  setTimeFilter: (filter) => set({ timeFilter: filter }),
}));
