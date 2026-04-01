import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../stores/appStore';
import { useFilterStore } from '../stores/filterStore';

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);

interface ParsedShortcut {
  key: string;
  meta: boolean;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
}

export interface ShortcutDef {
  shortcut: string;
  label: string;
  action: () => void;
}

const SHIFTED_KEY_ALIASES: Record<string, string> = {
  '/': '?',
  ',': '<',
  '.': '>',
  ';': ':',
  "'": '"',
  '[': '{',
  ']': '}',
  '\\': '|',
  '-': '_',
  '=': '+',
  '`': '~',
};

export function parseShortcut(shortcut: string, mac: boolean): ParsedShortcut {
  const normalized = shortcut === '?' ? 'shift+/' : shortcut;
  const parts = normalized.toLowerCase().split('+');
  const key = parts[parts.length - 1];
  const hasMod = parts.includes('mod');

  return {
    key,
    meta: hasMod && mac,
    ctrl: hasMod && !mac,
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
  };
}

export function matchesShortcut(event: KeyboardEvent, shortcut: string, mac: boolean): boolean {
  const parsed = parseShortcut(shortcut, mac);
  const eventKey = event.key.toLowerCase();
  const shiftedAlias = parsed.shift ? SHIFTED_KEY_ALIASES[parsed.key] : undefined;

  return (
    (eventKey === parsed.key || eventKey === shiftedAlias) &&
    event.metaKey === parsed.meta &&
    event.ctrlKey === parsed.ctrl &&
    event.shiftKey === parsed.shift &&
    event.altKey === parsed.alt
  );
}

export function useKeyboardShortcuts(onRefresh?: () => void) {
  const navigate = useNavigate();
  const {
    currentView,
    setView,
    shortcutHelpOpen,
    setShortcutHelpOpen,
    toggleShortcutHelp,
  } = useAppStore();
  const { setActiveTimeRange } = useFilterStore();

  const shortcuts = useMemo<ShortcutDef[]>(() => [
    { shortcut: 'mod+r', label: 'shortcuts.refresh', action: () => onRefresh?.() },
    { shortcut: '1', label: 'shortcuts.today', action: () => setActiveTimeRange({ kind: 'built_in', key: 'today' }) },
    { shortcut: '2', label: 'shortcuts.week', action: () => setActiveTimeRange({ kind: 'built_in', key: 'week' }) },
    { shortcut: '3', label: 'shortcuts.month', action: () => setActiveTimeRange({ kind: 'built_in', key: 'month' }) },
    { shortcut: '4', label: 'shortcuts.all', action: () => setActiveTimeRange({ kind: 'built_in', key: 'all' }) },
    { shortcut: 'g', label: 'shortcuts.dashboard', action: () => { setView('dashboard'); navigate('/'); } },
    { shortcut: 's', label: 'shortcuts.sessions', action: () => { setView('dashboard'); navigate('/sessions'); } },
    { shortcut: 'r', label: 'shortcuts.report', action: () => { setView('dashboard'); navigate('/report'); } },
    { shortcut: 'c', label: 'shortcuts.cost', action: () => { setView('dashboard'); navigate('/cost'); } },
    { shortcut: 'a', label: 'shortcuts.account', action: () => { setView('dashboard'); navigate('/account'); } },
    { shortcut: 'mod+,', label: 'shortcuts.settings', action: () => { setView('settings'); navigate('/'); } },
    { shortcut: '?', label: 'shortcuts.help', action: () => toggleShortcutHelp() },
    {
      shortcut: 'escape',
      label: 'shortcuts.close',
      action: () => {
        if (shortcutHelpOpen) setShortcutHelpOpen(false);
        else if (currentView === 'settings') setView('dashboard');
      },
    },
  ], [
    currentView,
    navigate,
    onRefresh,
    setActiveTimeRange,
    setShortcutHelpOpen,
    setView,
    shortcutHelpOpen,
    toggleShortcutHelp,
  ]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
          return;
        }
      }

      for (const def of shortcuts) {
        if (matchesShortcut(event, def.shortcut, isMac)) {
          event.preventDefault();
          def.action();
          return;
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [shortcuts]);

  return { helpOpen: shortcutHelpOpen, setHelpOpen: setShortcutHelpOpen, shortcuts };
}
