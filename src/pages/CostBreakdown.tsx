import { useNavigate } from 'react-router-dom';
import { useFilterStore } from '../stores/filterStore';
import { useStatistics, useSessions } from '../hooks/useStatistics';
import { Header } from '../components/layout/Header';
import { formatCost, formatTokens } from '../lib/utils';
import { ArrowLeft } from 'lucide-react';

const costCategories = [
  { key: 'input' as const, label: 'Input', color: '#3b82f6' },
  { key: 'output' as const, label: 'Output', color: '#22c55e' },
  { key: 'cache_read' as const, label: 'Cache Read', color: '#a855f7' },
  { key: 'cache_creation' as const, label: 'Cache Creation', color: '#f59e0b' },
];

// Hardcoded pricing matching parser.rs calculate_cost()
function getModelPricing(model: string) {
  if (model.includes('opus')) {
    return { input: 15, output: 75, cache_read: 1.5, cache_creation: 18.75 };
  }
  if (model.includes('haiku')) {
    return { input: 0.8, output: 4, cache_read: 0.08, cache_creation: 1 };
  }
  // default: sonnet
  return { input: 3, output: 15, cache_read: 0.3, cache_creation: 3.75 };
}

export function CostBreakdown() {
  const { selectedProject, timeFilter, selectedProvider } = useFilterStore();
  const navigate = useNavigate();
  const { data: stats, isLoading: statsLoading } = useStatistics(selectedProject, timeFilter, selectedProvider);
  const { data: sessions, isLoading: sessionsLoading } = useSessions(selectedProject, timeFilter, selectedProvider);

  const handleRefresh = () => {};

  if (statsLoading || sessionsLoading) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
        <div className="text-[#a0a0a0]">Loading cost breakdown...</div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
        <div className="text-[#a0a0a0]">No data available</div>
      </div>
    );
  }

  // Calculate cost by category across all models
  const costByCategory = { input: 0, output: 0, cache_read: 0, cache_creation: 0 };
  const M = 1_000_000;
  for (const [model, t] of Object.entries(stats.tokens.by_model)) {
    const p = getModelPricing(model);
    costByCategory.input += (t.input / M) * p.input;
    costByCategory.output += (t.output / M) * p.output;
    costByCategory.cache_read += (t.cache_read / M) * p.cache_read;
    costByCategory.cache_creation += (t.cache_creation / M) * p.cache_creation;
  }
  const totalCategoryCost = costByCategory.input + costByCategory.output + costByCategory.cache_read + costByCategory.cache_creation;

  // Models sorted by cost
  const modelCosts = Object.entries(stats.tokens.by_model)
    .map(([model, t]) => ({ model, cost: t.cost_usd, total: t.input + t.output + t.cache_read + t.cache_creation }))
    .filter(m => m.cost > 0)
    .sort((a, b) => b.cost - a.cost);
  const maxModelCost = modelCosts.length > 0 ? modelCosts[0].cost : 0;
  const modelColors = ['#3b82f6', '#22c55e', '#a855f7', '#f59e0b', '#ef4444', '#ec4899'];

  // Sessions sorted by cost
  const sortedSessions = [...(sessions ?? [])].filter(s => s.cost_usd > 0).sort((a, b) => b.cost_usd - a.cost_usd);

  return (
    <div className="min-h-screen bg-[#0f0f0f] flex flex-col">
      <Header onRefresh={handleRefresh} isRefreshing={false} />

      <main className="flex-1 p-6 overflow-auto">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate('/')}
            className="p-2 rounded-lg hover:bg-[#2a2a2a] transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-[#a0a0a0]" />
          </button>
          <h2 className="text-xl font-semibold">
            Cost Breakdown
            <span className="text-[#ef4444] text-sm font-normal ml-2">
              {formatCost(stats.cost_usd)} total
            </span>
          </h2>
        </div>

        {/* Cost by Category */}
        <div className="bg-[#1a1a1a] rounded-xl p-5 border border-[#2a2a2a] mb-6">
          <h3 className="text-lg font-semibold mb-4">Cost by Type</h3>

          {totalCategoryCost === 0 ? (
            <div className="h-[100px] flex items-center justify-center text-[#a0a0a0]">
              No cost data
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
                {costCategories.map(({ key, label, color }) => {
                  const value = costByCategory[key];
                  const pct = totalCategoryCost > 0 ? (value / totalCategoryCost * 100).toFixed(1) : '0.0';
                  return (
                    <div key={key} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: color }} />
                        <span className="text-sm text-[#a0a0a0]">{label}</span>
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
              <h3 className="text-lg font-semibold">Cost by Model</h3>
              <span className="text-xs text-[#606060]">{modelCosts.length} model{modelCosts.length !== 1 ? 's' : ''}</span>
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
                        <span className="text-xs text-[#a0a0a0]">{formatTokens(m.total)} tokens</span>
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
              Cost by Session
              <span className="text-[#a0a0a0] text-sm font-normal ml-2">
                {sortedSessions.length} session{sortedSessions.length !== 1 ? 's' : ''}
              </span>
            </h3>
          </div>

          {sortedSessions.length === 0 ? (
            <div className="p-8 text-center text-[#a0a0a0]">No sessions with cost</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2a2a2a] text-[#a0a0a0]">
                    <th className="text-left px-4 py-3 font-medium">Time</th>
                    <th className="text-left px-4 py-3 font-medium">Project</th>
                    <th className="text-left px-4 py-3 font-medium">Model</th>
                    <th className="text-right px-4 py-3 font-medium">Tokens</th>
                    <th className="text-right px-4 py-3 font-medium">Duration</th>
                    <th className="text-right px-4 py-3 font-medium">Cost</th>
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
