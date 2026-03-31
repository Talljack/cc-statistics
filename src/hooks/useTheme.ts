import { useEffect } from 'react';
import { useSettingsStore } from '../stores/settingsStore';

function applyResolvedTheme(theme: 'light' | 'dark') {
  document.documentElement.setAttribute('data-theme', theme);
}

export function useTheme() {
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = (theme: 'light' | 'dark' | 'system') => {
      if (theme === 'system') {
        applyResolvedTheme(mediaQuery.matches ? 'dark' : 'light');
      } else {
        applyResolvedTheme(theme);
      }
    };

    applyTheme(useSettingsStore.getState().theme);

    const unsubscribe = useSettingsStore.subscribe((state) => {
      applyTheme(state.theme);
    });

    const handleSystemChange = (event: MediaQueryListEvent) => {
      if (useSettingsStore.getState().theme === 'system') {
        applyResolvedTheme(event.matches ? 'dark' : 'light');
      }
    };

    mediaQuery.addEventListener('change', handleSystemChange);

    return () => {
      unsubscribe();
      mediaQuery.removeEventListener('change', handleSystemChange);
    };
  }, []);
}
