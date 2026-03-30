import { RefreshCw } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useTranslation } from '../../lib/i18n';

interface FooterProps {
  lastUpdated?: string;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export function Footer({ lastUpdated, onRefresh, isRefreshing }: FooterProps) {
  const { t } = useTranslation();
  const formattedDate = lastUpdated
    ? new Date(lastUpdated).toLocaleString()
    : t('common.never');

  return (
    <footer className="bg-[var(--color-bg-surface)] border-t border-[var(--color-border-base)] px-6 py-3">
      <div className="flex items-center justify-between text-sm text-[var(--color-text-secondary)]">
        <div>{t('footer.lastUpdated')}{formattedDate}</div>
        <div className="flex items-center gap-4">
          <span className="text-[var(--color-text-faint)] text-xs" title={t('shortcuts.hint')}>
            ⌨ ?
          </span>
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
