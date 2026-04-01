import { create } from 'zustand';

type View = 'dashboard' | 'settings';

interface AppStore {
  currentView: View;
  shortcutHelpOpen: boolean;
  setView: (view: View) => void;
  setShortcutHelpOpen: (open: boolean) => void;
  toggleShortcutHelp: () => void;
}

export const useAppStore = create<AppStore>((set) => ({
  currentView: 'dashboard',
  shortcutHelpOpen: false,
  setView: (view) => set({ currentView: view }),
  setShortcutHelpOpen: (open) => set({ shortcutHelpOpen: open }),
  toggleShortcutHelp: () => set((state) => ({ shortcutHelpOpen: !state.shortcutHelpOpen })),
}));
