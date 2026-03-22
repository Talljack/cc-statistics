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
    <footer className="bg-[#1a1a1a] border-t border-[#2a2a2a] px-6 py-3">
      <div className="flex items-center justify-between text-sm text-[#a0a0a0]">
        <div>{t('footer.lastUpdated')}{formattedDate}</div>
        <div className="flex items-center gap-4">
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className={cn(
              'flex items-center gap-2 transition-colors',
              isRefreshing
                ? 'text-[#3b82f6] cursor-not-allowed'
                : 'hover:text-white active:text-[#3b82f6] cursor-pointer'
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
