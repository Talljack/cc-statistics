import { X } from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import type { ShortcutDef } from '../../hooks/useKeyboardShortcuts';

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);

function formatShortcut(shortcut: string): string {
  if (shortcut === '?') return '?';
  return shortcut
    .replace('mod', isMac ? '⌘' : 'Ctrl')
    .replace('escape', 'Esc')
    .split('+')
    .map((part) => {
      if (part === 'shift') return isMac ? '⇧' : 'Shift';
      if (part === 'alt') return isMac ? '⌥' : 'Alt';
      return part.length === 1 ? part.toUpperCase() : part;
    })
    .join(' + ');
}

export function ShortcutHelpDialog({
  open,
  onClose,
  shortcuts,
}: {
  open: boolean;
  onClose: () => void;
  shortcuts: ShortcutDef[];
}) {
  const { t } = useTranslation();

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-[var(--color-bg-surface)] border border-[var(--color-border-base)] rounded-2xl p-6 w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{t('shortcuts.title')}</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--color-bg-hover)] transition-colors"
          >
            <X className="w-4 h-4 text-[var(--color-text-tertiary)]" />
          </button>
        </div>

        <div className="space-y-2">
          {shortcuts.map((shortcut) => (
            <div
              key={shortcut.shortcut}
              className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-[var(--color-bg-hover)]"
            >
              <span className="text-sm text-[var(--color-text-secondary)]">{t(shortcut.label)}</span>
              <kbd className="px-2 py-1 bg-[var(--color-bg-hover)] border border-[var(--color-border-base)] rounded-md text-xs font-mono text-[var(--color-text-tertiary)]">
                {formatShortcut(shortcut.shortcut)}
              </kbd>
            </div>
          ))}
        </div>

        <p className="text-xs text-[var(--color-text-muted)] mt-4 text-center">
          {t('shortcuts.hint')}
        </p>
      </div>
    </div>
  );
}
