import { useNavigate } from 'react-router-dom';
import { useFilterStore } from '../stores/filterStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useStatistics, useSessions } from '../hooks/useStatistics';
import { Header } from '../components/layout/Header';
import { formatCost, formatTokens } from '../lib/utils';
import { usePricingStore, FALLBACK_PRICING } from '../stores/pricingStore';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from '../lib/i18n';

const costCategories = [
  { key: 'input' as const, labelKey: 'cost.input', color: '#3b82f6' },
  { key: 'output' as const, labelKey: 'cost.output', color: '#22c55e' },
  { key: 'cache_read' as const, labelKey: 'cost.cacheRead', color: '#a855f7' },
  { key: 'cache_creation' as const, labelKey: 'cost.cacheCreation', color: '#f59e0b' },
];

/**
 * Get pricing for a model from dynamic sources (custom overrides → OpenRouter → fallback).
 * Never hardcoded — always reads from remote-fetched pricingStore.
 */
function getDynamicModelPricing(model: string, customPricingEnabled: boolean, customPricing: Record<string, { input: number; output: number; cacheRead: number; cacheCreation: number }>) {
  // 1. Custom pricing override (user-defined, highest priority)
  if (customPricingEnabled && customPricing[model]) {
    const p = customPricing[model];
    return { input: p.input, output: p.output, cache_read: p.cacheRead, cache_creation: p.cacheCreation };
  }

  // 2. OpenRouter dynamic pricing (fetched from API)
  const dynamic = usePricingStore.getState().getPricingForModel(model);
  if (dynamic) {
    return { input: dynamic.input, output: dynamic.output, cache_read: dynamic.cacheRead, cache_creation: dynamic.cacheWrite };
  }

  // 3. Fallback (Sonnet pricing from pricingStore)
  return { input: FALLBACK_PRICING.input, output: FALLBACK_PRICING.output, cache_read: FALLBACK_PRICING.cacheRead, cache_creation: FALLBACK_PRICING.cacheWrite };
}

export function CostBreakdown() {
  const { t } = useTranslation();
  const { selectedProject, activeTimeRange, selectedProvider } = useFilterStore();
  const { customPricingEnabled, customPricing } = useSettingsStore();
  const navigate = useNavigate();
  const { data: stats, isLoading: statsLoading } = useStatistics(selectedProject, activeTimeRange, selectedProvider);
  const { data: sessions, isLoading: sessionsLoading } = useSessions(selectedProject, activeTimeRange, selectedProvider);

  if (statsLoading || sessionsLoading) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
        <div className="text-[#a0a0a0]">{t('cost.loading')}</div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
        <div className="text-[#a0a0a0]">{t('cost.noData')}</div>
      </div>
    );
  }

  const displayCost = stats.cost_usd;

  // Calculate cost by category using dynamic pricing
  const costByCategory = { input: 0, output: 0, cache_read: 0, cache_creation: 0 };
  const M = 1_000_000;
  for (const [model, tk] of Object.entries(stats.tokens.by_model)) {
    const p = getDynamicModelPricing(model, customPricingEnabled, customPricing as never);
    costByCategory.input += (tk.input / M) * p.input;
    costByCategory.output += (tk.output / M) * p.output;
    costByCategory.cache_read += (tk.cache_read / M) * p.cache_read;
    costByCategory.cache_creation += (tk.cache_creation / M) * p.cache_creation;
  }
  const totalCategoryCost = costByCategory.input + costByCategory.output + costByCategory.cache_read + costByCategory.cache_creation;

  // Models sorted by cost
  const modelCosts = Object.entries(stats.tokens.by_model)
    .map(([model, tk]) => ({ model, cost: tk.cost_usd, total: tk.input + tk.output + tk.cache_read + tk.cache_creation }))
    .filter(m => m.cost > 0)
    .sort((a, b) => b.cost - a.cost);
  const maxModelCost = modelCosts.length > 0 ? modelCosts[0].cost : 0;
  const modelColors = ['#3b82f6', '#22c55e', '#a855f7', '#f59e0b', '#ef4444', '#ec4899'];

  // Sessions sorted by cost
  const sortedSessions = [...(sessions ?? [])].filter(s => s.cost_usd > 0).sort((a, b) => b.cost_usd - a.cost_usd);

  return (
    <div className="min-h-screen bg-[#0f0f0f] flex flex-col">
      <Header onRefresh={() => {}} isRefreshing={false} />

      <main className="flex-1 p-6 overflow-auto">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate('/')}
            className="p-2 rounded-lg hover:bg-[#2a2a2a] transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-[#a0a0a0]" />
          </button>
          <h2 className="text-xl font-semibold">
            {t('cost.title')}
            <span className="text-[#ef4444] text-sm font-normal ml-2">
              {formatCost(displayCost)} {t('common.total')}
            </span>
          </h2>
        </div>

        {/* Cost by Category */}
        <div className="bg-[#1a1a1a] rounded-xl p-5 border border-[#2a2a2a] mb-6">
          <h3 className="text-lg font-semibold mb-4">{t('cost.byType')}</h3>

          {totalCategoryCost === 0 ? (
            <div className="h-[100px] flex items-center justify-center text-[#a0a0a0]">
              {t('cost.noTypeData')}
            </div>
          ) : (
            <>
              {/* Stacked bar */}
              <div className="h-4 bg-[#2a2a2a] rounded-full overflow-hidden flex mb-4">
                {costCategories.map(({ key, color }) => {
                  const value = costByCategory[key];
                  const pct = totalCategoryCost > 0 ? (value / totalCategoryCost) * 100 : 0;
                  if (pct === 0) return null;
                  return (
                    <div
                      key={key}
                      className="h-full transition-all duration-500 first:rounded-l-full last:rounded-r-full"
                      style={{ width: `${pct}%`, backgroundColor: color }}
                      title={`${formatCost(value)} (${pct.toFixed(1)}%)`}
                    />
                  );
                })}
              </div>

              {/* Legend */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                {costCategories.map(({ key, labelKey, color }) => {
                  const value = costByCategory[key];
                  const pct = totalCategoryCost > 0 ? (value / totalCategoryCost * 100).toFixed(1) : '0.0';
                  return (
                    <div key={key} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: color }} />
                        <span className="text-sm text-[#a0a0a0]">{t(labelKey)}</span>
                      </div>
                      <span className="text-sm font-medium" style={{ color }}>
                        {formatCost(value)} <span className="text-[#606060]">({pct}%)</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Cost by Model */}
        {modelCosts.length > 0 && (
          <div className="bg-[#1a1a1a] rounded-xl p-5 border border-[#2a2a2a] mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{t('cost.byModel')}</h3>
              <span className="text-xs text-[#606060]">{modelCosts.length} {modelCosts.length !== 1 ? t('cost.models') : t('cost.model')}</span>
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
                        <span className="text-xs text-[#a0a0a0]">{formatTokens(m.total)} {t('cost.tokens')}</span>
                        <span className="text-sm font-semibold text-[#ef4444]">{formatCost(m.cost)}</span>
                      </div>
                    </div>
                    <div className="h-2 bg-[#2a2a2a] rounded-full overflow-hidden">
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
        <div className="bg-[#1a1a1a] rounded-xl border border-[#2a2a2a] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#2a2a2a]">
            <h3 className="text-lg font-semibold">
              {t('cost.bySession')}
              <span className="text-[#a0a0a0] text-sm font-normal ml-2">
                {sortedSessions.length} {sortedSessions.length !== 1 ? t('cost.sessions') : t('cost.session')}
              </span>
            </h3>
          </div>

          {sortedSessions.length === 0 ? (
            <div className="p-8 text-center text-[#a0a0a0]">{t('cost.noSessions')}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2a2a2a] text-[#a0a0a0]">
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
                      key={session.session_id}
                      className="border-b border-[#2a2a2a] hover:bg-[#222] transition-colors"
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-[#a0a0a0]">
                        {formatTimestamp(session.timestamp)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[#3b82f6]">{session.project_name}</span>
                      </td>
                      <td className="px-4 py-3 text-[#a0a0a0] max-w-[200px] truncate" title={session.model}>
                        {session.model}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[#f59e0b]">
                        {formatTokens(session.total_tokens)}
                      </td>
                      <td className="px-4 py-3 text-right text-[#a0a0a0]">
                        {session.duration_formatted}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[#ef4444] font-semibold">
                        {formatCost(session.cost_usd)}
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
