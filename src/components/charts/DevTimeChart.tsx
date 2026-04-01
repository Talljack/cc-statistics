import type { DevTime } from '../../types/statistics';
import { formatDuration } from '../../lib/utils';
import { Zap } from 'lucide-react';
import { useTranslation } from '../../lib/i18n';

interface DevTimeChartProps {
  devTime: DevTime;
}

export function DevTimeChart({ devTime }: DevTimeChartProps) {
  const { t } = useTranslation();

  if (devTime.total_ms === 0) {
    return (
      <div className="bg-[var(--color-bg-surface)] rounded-xl p-5 border border-[var(--color-border-base)]">
        <h3 className="text-lg font-semibold mb-4">{t('chart.aiProcessingTime')}</h3>
        <div className="h-[200px] flex items-center justify-center text-[var(--color-text-secondary)]">
          {t('common.noData')}
        </div>
      </div>
    );
  }

  const totalSeconds = Math.floor(devTime.total_ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return (
    <div className="bg-[var(--color-bg-surface)] rounded-xl p-5 border border-[var(--color-border-base)]">
      <h3 className="text-lg font-semibold mb-5">{t('chart.aiProcessingTime')}</h3>

      <div className="flex items-center gap-6">
        {/* Big number display */}
        <div className="flex items-center justify-center w-[160px] h-[160px] shrink-0 rounded-full border-4 border-[var(--color-accent-purple)]/30 bg-[var(--color-accent-purple)]/5">
          <div className="text-center">
            <div className="text-3xl font-bold text-[var(--color-accent-purple)]">{formatDuration(devTime.total_ms)}</div>
            <div className="text-xs text-[var(--color-text-secondary)] mt-1">{t('common.total')}</div>
          </div>
        </div>

        {/* Breakdown */}
        <div className="flex-1 space-y-3">
          {hours > 0 && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--color-accent-purple)]/5 border border-[var(--color-accent-purple)]/10">
              <span className="text-sm text-[var(--color-text-secondary)]">{t('chart.hours')}</span>
              <span className="text-2xl font-bold text-[var(--color-accent-purple)]">{hours}</span>
            </div>
          )}
          <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--color-accent-purple)]/5 border border-[var(--color-accent-purple)]/10">
            <span className="text-sm text-[var(--color-text-secondary)]">{t('chart.minutes')}</span>
            <span className="text-2xl font-bold text-[var(--color-accent-purple)]">{hours > 0 ? minutes : Math.floor(totalSeconds / 60)}</span>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--color-accent-purple)]/5 border border-[var(--color-accent-purple)]/10">
            <span className="text-sm text-[var(--color-text-secondary)]">{t('chart.seconds')}</span>
            <span className="text-2xl font-bold text-[var(--color-accent-purple)]">{seconds}</span>
          </div>

          <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] pt-1">
            <Zap className="w-3 h-3" />
            <span>{t('chart.timeDesc')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
