import { Keyboard, RefreshCw } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useTranslation } from '../../lib/i18n';

interface FooterProps {
  lastUpdated?: string;
  onRefresh: () => void;
  onOpenShortcuts?: () => void;
  isRefreshing: boolean;
}

export function Footer({ lastUpdated, onRefresh, onOpenShortcuts, isRefreshing }: FooterProps) {
  const { t } = useTranslation();
  const formattedDate = lastUpdated
    ? new Date(lastUpdated).toLocaleString()
    : t('common.never');

  return (
    <footer className="bg-[var(--color-bg-surface)] border-t border-[var(--color-border-base)] px-6 py-3">
      <div className="flex items-center justify-between text-sm text-[var(--color-text-secondary)]">
        <div>{t('footer.lastUpdated')}{formattedDate}</div>
        <div className="flex items-center gap-4">
          {onOpenShortcuts && (
            <button
              type="button"
              onClick={onOpenShortcuts}
              title={t('shortcuts.hint')}
              aria-label={t('shortcuts.hint')}
              className="group flex items-center gap-1.5 rounded-lg border border-[var(--color-border-base)] bg-[var(--color-bg-hover)] px-2.5 py-1.5 text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-active)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              <Keyboard className="w-3.5 h-3.5 text-[var(--color-text-tertiary)] transition-colors group-hover:text-[var(--color-accent-blue)]" />
              <kbd className="rounded-md border border-[var(--color-border-base)] bg-[var(--color-bg-surface)] px-1.5 py-0.5 text-[10px] leading-none font-mono text-[var(--color-text-secondary)] shadow-sm">
                ?
              </kbd>
            </button>
          )}
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className={cn(
              'flex items-center gap-2 transition-colors',
              isRefreshing
                ? 'text-[var(--color-accent-blue)] cursor-not-allowed'
                : 'hover:text-[var(--color-text-primary)] cursor-pointer'
            )}
          >
            <RefreshCw
              className={cn(
                'w-4 h-4 transition-transform',
                isRefreshing && 'animate-refresh-spin'
              )}
            />
            {isRefreshing ? t('common.refreshing') : t('common.refresh')}
          </button>
        </div>
      </div>
    </footer>
  );
}
