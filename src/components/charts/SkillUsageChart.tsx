import { formatNumber } from '../../lib/utils';
import { useTranslation } from '../../lib/i18n';

interface SkillUsageChartProps {
  skillUsage: Record<string, number>;
}

export function SkillUsageChart({ skillUsage }: SkillUsageChartProps) {
  const { t } = useTranslation();
  const entries = Object.entries(skillUsage);

  if (entries.length === 0) {
    return null;
  }

  const sorted = entries.sort((a, b) => b[1] - a[1]);
  const maxCount = sorted[0][1];
  const totalCalls = entries.reduce((sum, [, count]) => sum + count, 0);
  const colors = ['#22c55e', '#3b82f6', '#a855f7', '#f59e0b', '#ef4444', '#ec4899'];

  return (
    <div className="bg-[var(--color-bg-surface)] rounded-xl p-5 border border-[var(--color-border-base)]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">{t('chart.skillUsage')}</h3>
        <span className="text-sm text-[var(--color-text-secondary)]">{formatNumber(totalCalls)} {t('common.calls')}</span>
      </div>
      <div className="space-y-3">
        {sorted.map(([name, count], index) => {
          const percentage = maxCount > 0 ? (count / maxCount) * 100 : 0;
          const color = colors[index % colors.length];

          return (
            <div key={name}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm truncate mr-3" title={name}>
                  {name}
                </span>
                <span className="text-sm font-semibold shrink-0" style={{ color }}>
                  {formatNumber(count)}
                </span>
              </div>
              <div className="h-2 bg-[var(--color-bg-hover)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${percentage}%`,
                    backgroundColor: color,
                    opacity: 0.8,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
