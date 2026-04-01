import type { CodeChanges as CodeChangesType } from '../../types/statistics';
import { useTranslation } from '../../lib/i18n';

interface CodeChangesProps {
  codeChanges: CodeChangesType;
  onClick?: () => void;
}

export function CodeChanges({ codeChanges, onClick }: CodeChangesProps) {
  const { t } = useTranslation();
  const { total, by_extension } = codeChanges;
  const extensions = Object.entries(by_extension);

  const sortedExtensions = extensions
    .map(([ext, changes]) => ({
      extension: ext,
      total: changes.additions + changes.deletions,
      ...changes,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  const maxChanges = sortedExtensions.length > 0
    ? Math.max(...sortedExtensions.map(e => e.total))
    : 0;

  return (
    <div
      className={`bg-[var(--color-bg-surface)] rounded-xl p-5 border border-[var(--color-border-base)]${onClick ? ' cursor-pointer hover:border-[var(--color-border-strong)] transition-colors' : ''}`}
      onClick={onClick}
    >
      <h3 className="text-lg font-semibold mb-4">{t('chart.codeChanges')}</h3>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <div className="p-3 rounded-lg bg-[var(--color-accent-blue)]/5 border border-[var(--color-accent-blue)]/10 text-center">
          <div className="text-xl font-bold text-[var(--color-accent-blue)]">{total.files.toLocaleString()}</div>
          <div className="text-xs text-[var(--color-text-secondary)] mt-0.5">{t('chart.files')}</div>
        </div>
        <div className="p-3 rounded-lg bg-[var(--color-accent-green)]/5 border border-[var(--color-accent-green)]/10 text-center">
          <div className="text-xl font-bold text-[var(--color-accent-green)]">+{total.additions.toLocaleString()}</div>
          <div className="text-xs text-[var(--color-text-secondary)] mt-0.5">{t('chart.added')}</div>
        </div>
        <div className="p-3 rounded-lg bg-[var(--color-accent-red)]/5 border border-[var(--color-accent-red)]/10 text-center">
          <div className="text-xl font-bold text-[var(--color-accent-red)]">-{total.deletions.toLocaleString()}</div>
          <div className="text-xs text-[var(--color-text-secondary)] mt-0.5">{t('chart.deleted')}</div>
        </div>
        <div className="p-3 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border-base)] text-center">
          <div className="text-xl font-bold">
            {(total.additions - total.deletions).toLocaleString()}
          </div>
          <div className="text-xs text-[var(--color-text-secondary)] mt-0.5">{t('chart.net')}</div>
        </div>
      </div>

      {/* Extensions with bars */}
      {sortedExtensions.length > 0 ? (
        <div className="space-y-2.5">
          {sortedExtensions.map((ext) => {
            const addPct = maxChanges > 0 ? (ext.additions / maxChanges) * 100 : 0;
            const delPct = maxChanges > 0 ? (ext.deletions / maxChanges) * 100 : 0;

            return (
              <div key={ext.extension}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-[var(--color-text-primary)]">.{ext.extension}</span>
                    <span className="text-xs text-[var(--color-text-muted)]">{ext.files} {ext.files !== 1 ? t('chart.files').toLowerCase() : t('chart.file')}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-[var(--color-accent-green)]">+{ext.additions.toLocaleString()}</span>
                    <span className="text-[var(--color-accent-red)]">-{ext.deletions.toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex gap-0.5 h-1.5">
                  {ext.additions > 0 && (
                    <div
                      className="h-full bg-[var(--color-accent-green)] rounded-full"
                      style={{ width: `${addPct}%`, minWidth: '2px' }}
                    />
                  )}
                  {ext.deletions > 0 && (
                    <div
                      className="h-full bg-[var(--color-accent-red)] rounded-full"
                      style={{ width: `${delPct}%`, minWidth: '2px' }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : total.files === 0 ? (
        <div className="h-[120px] flex items-center justify-center text-[var(--color-text-secondary)]">
          {t('chart.noCodeChanges')}
        </div>
      ) : null}
    </div>
  );
}
