import { useNavigate } from 'react-router-dom';
import { useFilterStore } from '../stores/filterStore';
import { useStatistics, useSessions } from '../hooks/useStatistics';
import { Header } from '../components/layout/Header';
import { formatCost, formatTokens } from '../lib/utils';
import { useCostMetrics } from '../hooks/useCostMetrics';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from '../lib/i18n';

const billableCategories = [
  { key: 'input' as const, labelKey: 'cost.input', color: '#3b82f6' },
  { key: 'output' as const, labelKey: 'cost.output', color: '#22c55e' },
];

export function CostBreakdown() {
  const { t } = useTranslation();
  const { selectedProjects, activeTimeRange, selectedProviders } = useFilterStore();
  const navigate = useNavigate();
  const { data: stats, isLoading: statsLoading } = useStatistics(selectedProjects, activeTimeRange, selectedProviders);
  const { data: sessions, isLoading: sessionsLoading } = useSessions(selectedProjects, activeTimeRange, selectedProviders);
  const costMetrics = useCostMetrics(sessions);

  if (statsLoading || sessionsLoading) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-base)] flex items-center justify-center">
        <div className="text-[var(--color-text-secondary)]">{t('cost.loading')}</div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-base)] flex items-center justify-center">
        <div className="text-[var(--color-text-secondary)]">{t('cost.noData')}</div>
      </div>
    );
  }

  const displayCost = costMetrics.totalCost;
  const costByCategory = costMetrics.costByType;
  const totalCategoryCost = displayCost;
  const cacheRows = [
    {
      key: 'cache_read' as const,
      labelKey: 'cost.cacheRead',
      color: '#a855f7',
      tokens: costMetrics.cacheTokens.read,
      cost: costMetrics.cacheCost.read,
    },
    {
      key: 'cache_creation' as const,
      labelKey: 'cost.cacheCreation',
      color: '#f59e0b',
      tokens: costMetrics.cacheTokens.creation,
      cost: costMetrics.cacheCost.creation,
    },
  ];
  const hasCacheUsage = cacheRows.some((row) => row.tokens > 0 || row.cost > 0);

  // Models sorted by cost
  const modelCosts = Object.entries(costMetrics.costByModel)
    .map(([model, cost]) => {
      const tokens = stats.tokens.by_model[model];
      const total = tokens
        ? tokens.input + tokens.output + tokens.cache_read + tokens.cache_creation
        : 0;
      return { model, cost, total };
    })
    .filter((modelCost) => modelCost.cost > 0)
    .sort((a, b) => b.cost - a.cost);
  const maxModelCost = modelCosts.length > 0 ? modelCosts[0].cost : 0;
  const modelColors = ['#3b82f6', '#22c55e', '#a855f7', '#f59e0b', '#ef4444', '#ec4899'];

  // Sessions sorted by cost
  const sortedSessions = [...(sessions ?? [])]
    .map((session) => ({
      ...session,
      derivedCost: costMetrics.getSessionCost(session),
    }))
    .filter((session) => session.derivedCost > 0)
    .sort((a, b) => b.derivedCost - a.derivedCost);

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)] flex flex-col">
      <Header onRefresh={() => {}} isRefreshing={false} />

      <main className="flex-1 p-6 overflow-auto">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate('/')}
            className="p-2 rounded-lg hover:bg-[var(--color-bg-hover)] transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-[var(--color-text-secondary)]" />
          </button>
          <h2 className="text-xl font-semibold">
            {t('cost.title')}
            <span className="text-[#ef4444] text-sm font-normal ml-2">
              {formatCost(displayCost)} {t('common.total')}
            </span>
          </h2>
        </div>

        {/* Cost by Category */}
        <div className="bg-[var(--color-bg-surface)] rounded-xl p-5 border border-[var(--color-border-base)] mb-6">
          <h3 className="text-lg font-semibold mb-4">{t('cost.byType')}</h3>

          {totalCategoryCost === 0 && !hasCacheUsage ? (
            <div className="h-[100px] flex items-center justify-center text-[var(--color-text-secondary)]">
              {t('cost.noTypeData')}
            </div>
          ) : (
            <>
              {/* Stacked bar */}
              <div data-testid="cost-type-stacked-bar" className="h-4 bg-[var(--color-bg-hover)] rounded-full overflow-hidden flex mb-4">
                {billableCategories.map(({ key, color }) => {
                  const value = costByCategory[key];
                  const pct = totalCategoryCost > 0 ? (value / totalCategoryCost) * 100 : 0;
                  if (pct === 0) return null;
                  return (
                    <div
                      key={key}
                      data-testid={`cost-type-segment-${key}`}
                      className="h-full transition-all duration-500 first:rounded-l-full last:rounded-r-full"
                      style={{ width: `${pct}%`, backgroundColor: color }}
                      title={`${formatCost(value)} (${pct.toFixed(1)}%)`}
                    />
                  );
                })}
              </div>

              {/* Legend */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                {billableCategories.map(({ key, labelKey, color }) => {
                  const value = costByCategory[key];
                  const pct = totalCategoryCost > 0 ? (value / totalCategoryCost * 100).toFixed(1) : '0.0';
                  return (
                    <div key={key} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: color }} />
                        <span className="text-sm text-[var(--color-text-secondary)]">{t(labelKey)}</span>
                      </div>
                      <span className="text-sm font-medium" style={{ color }}>
                        {formatCost(value)} <span className="text-[var(--color-text-muted)]">({pct}%)</span>
                      </span>
                    </div>
                  );
                })}
                {cacheRows.map(({ key, labelKey, color, tokens, cost }) => {
                  return (
                    <div key={key} className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: color }} />
                        <div className="min-w-0">
                          <span className="text-sm text-[var(--color-text-secondary)]">{t(labelKey)}</span>
                          <div className="text-[11px] text-[var(--color-text-muted)]">
                            {t('cost.cached')} {formatTokens(tokens)} {t('cost.tokens')} / {t('cost.notIncludedInTotal')}
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-medium" style={{ color }}>{formatCost(cost)}</div>
                        <div className="text-xs text-[var(--color-text-muted)]">{t('cost.cacheValue')}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Cost by Model */}
        {modelCosts.length > 0 && (
          <div className="bg-[var(--color-bg-surface)] rounded-xl p-5 border border-[var(--color-border-base)] mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{t('cost.byModel')}</h3>
              <span className="text-xs text-[var(--color-text-muted)]">{modelCosts.length} {modelCosts.length !== 1 ? t('cost.models') : t('cost.model')}</span>
            </div>
            <div className="space-y-4">
              {modelCosts.map((m, index) => {
                const pct = maxModelCost > 0 ? (m.cost / maxModelCost) * 100 : 0;
                const color = modelColors[index % modelColors.length];
                return (
                  <div key={m.model}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <span className="text-sm truncate" title={m.model}>{m.model}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-3">
                        <span className="text-xs text-[var(--color-text-secondary)]">{formatTokens(m.total)} {t('cost.tokens')}</span>
                        <span className="text-sm font-semibold text-[#ef4444]">{formatCost(m.cost)}</span>
                      </div>
                    </div>
                    <div className="h-2 bg-[var(--color-bg-hover)] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.8 }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Cost by Session */}
        <div className="bg-[var(--color-bg-surface)] rounded-xl border border-[var(--color-border-base)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--color-border-base)]">
            <h3 className="text-lg font-semibold">
              {t('cost.bySession')}
              <span className="text-[var(--color-text-secondary)] text-sm font-normal ml-2">
                {sortedSessions.length} {sortedSessions.length !== 1 ? t('cost.sessions') : t('cost.session')}
              </span>
            </h3>
          </div>

          {sortedSessions.length === 0 ? (
            <div className="p-8 text-center text-[var(--color-text-secondary)]">{t('cost.noSessions')}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border-base)] text-[var(--color-text-secondary)]">
                    <th className="text-left px-4 py-3 font-medium">{t('cost.time')}</th>
                    <th className="text-left px-4 py-3 font-medium">{t('cost.project')}</th>
                    <th className="text-left px-4 py-3 font-medium">{t('cost.model')}</th>
                    <th className="text-right px-4 py-3 font-medium">{t('cost.tokens')}</th>
                    <th className="text-right px-4 py-3 font-medium">{t('sessions.duration')}</th>
                    <th className="text-right px-4 py-3 font-medium">{t('sessions.cost')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedSessions.map((session) => (
                    <tr
                      key={`${session.source}:${session.session_id}`}
                      className="border-b border-[var(--color-border-base)] hover:bg-[var(--color-bg-elevated)] transition-colors"
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-[var(--color-text-secondary)]">
                        {formatTimestamp(session.timestamp)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[#3b82f6]">{session.project_name}</span>
                      </td>
                      <td className="px-4 py-3 text-[var(--color-text-secondary)] max-w-[200px] truncate" title={session.model}>
                        {session.model}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[#f59e0b]">
                        {formatTokens(session.total_tokens)}
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--color-text-secondary)]">
                        {session.duration_formatted}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[#ef4444] font-semibold">
                        {formatCost(session.derivedCost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function formatTimestamp(ts: string): string {
  if (!ts) return '-';
  try {
    const date = new Date(ts);
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return ts;
  }
}
