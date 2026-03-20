import { formatTokens, formatCost } from '../../lib/utils';
import type { TokenUsage } from '../../types/statistics';

interface TokenChartProps {
  tokens: TokenUsage;
}

const tokenCategories = [
  { key: 'input' as const, label: 'Input', color: '#3b82f6' },
  { key: 'output' as const, label: 'Output', color: '#22c55e' },
  { key: 'cache_read' as const, label: 'Cache Read', color: '#a855f7' },
  { key: 'cache_creation' as const, label: 'Cache Creation', color: '#f59e0b' },
];

export function TokenChart({ tokens }: TokenChartProps) {
  const totalTokens = tokens.input + tokens.output + tokens.cache_read + tokens.cache_creation;
  const byModel = Object.entries(tokens.by_model);

  if (totalTokens === 0) {
    return (
      <div className="bg-[#1a1a1a] rounded-xl p-5 border border-[#2a2a2a]">
        <h3 className="text-lg font-semibold mb-4">Token Usage</h3>
        <div className="h-[200px] flex items-center justify-center text-[#a0a0a0]">
          No data available
        </div>
      </div>
    );
  }

  const sortedModels = byModel
    .map(([model, t]) => ({
      model,
      total: t.input + t.output + t.cache_read + t.cache_creation,
      ...t,
    }))
    .filter(m => m.total > 0)
    .sort((a, b) => b.total - a.total);

  const maxTokens = Math.max(...sortedModels.map(m => m.total));
  const modelColors = ['#3b82f6', '#22c55e', '#a855f7', '#f59e0b', '#ef4444', '#ec4899'];

  // Cache stats
  const totalCache = tokens.cache_read + tokens.cache_creation;
  const cacheHitRate = totalCache > 0
    ? (tokens.cache_read / totalCache * 100)
    : 0;

  return (
    <div className="bg-[#1a1a1a] rounded-xl p-5 border border-[#2a2a2a]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Token Usage</h3>
        <span className="text-sm text-[#a0a0a0]">{formatTokens(totalTokens)} total</span>
      </div>

      {/* Token Type Breakdown - Stacked Bar */}
      <div className="mb-5">
        <div className="h-4 bg-[#2a2a2a] rounded-full overflow-hidden flex">
          {tokenCategories.map(({ key, color }) => {
            const value = tokens[key];
            const pct = totalTokens > 0 ? (value / totalTokens) * 100 : 0;
            if (pct === 0) return null;
            return (
              <div
                key={key}
                className="h-full transition-all duration-500 first:rounded-l-full last:rounded-r-full"
                style={{ width: `${pct}%`, backgroundColor: color }}
                title={`${formatTokens(value)} (${pct.toFixed(1)}%)`}
              />
            );
          })}
        </div>

        {/* Legend + Values */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 mt-3">
          {tokenCategories.map(({ key, label, color }) => {
            const value = tokens[key];
            const pct = totalTokens > 0 ? (value / totalTokens * 100).toFixed(1) : '0.0';
            return (
              <div key={key} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-sm text-[#a0a0a0]">{label}</span>
                </div>
                <span className="text-sm font-medium" style={{ color }}>
                  {formatTokens(value)} <span className="text-[#606060]">({pct}%)</span>
                </span>
              </div>
            );
          })}
        </div>

        {/* Cache Hit Rate */}
        {totalCache > 0 && (
          <div className="mt-3 pt-3 border-t border-[#2a2a2a] flex items-center justify-between">
            <span className="text-sm text-[#a0a0a0]">Cache Hit Rate</span>
            <span className="text-sm font-semibold" style={{ color: cacheHitRate > 70 ? '#22c55e' : cacheHitRate > 30 ? '#f59e0b' : '#ef4444' }}>
              {cacheHitRate.toFixed(1)}%
            </span>
          </div>
        )}
      </div>

      {/* By Model */}
      {sortedModels.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-3 pt-3 border-t border-[#2a2a2a]">
            <span className="text-sm font-medium text-[#a0a0a0]">By Model</span>
            <span className="text-xs text-[#606060]">{sortedModels.length} model{sortedModels.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="space-y-4">
            {sortedModels.map((model, index) => {
              const percentage = maxTokens > 0 ? (model.total / maxTokens) * 100 : 0;
              const color = modelColors[index % modelColors.length];

              return (
                <div key={model.model}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-sm truncate" title={model.model}>
                        {model.model}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-3">
                      <span className="text-xs text-[#ef4444]">{formatCost(model.cost_usd)}</span>
                      <span className="text-sm font-semibold" style={{ color }}>{formatTokens(model.total)}</span>
                    </div>
                  </div>
                  <div className="h-2 bg-[#2a2a2a] rounded-full overflow-hidden">
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
        </>
      )}
    </div>
  );
}
