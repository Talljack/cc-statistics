import { create } from 'zustand';

type View = 'dashboard' | 'settings';

interface AppStore {
  currentView: View;
  setView: (view: View) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  currentView: 'dashboard',
  setView: (view) => set({ currentView: view }),
}));
