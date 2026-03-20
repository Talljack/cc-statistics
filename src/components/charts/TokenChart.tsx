import { formatTokens } from '../../lib/utils';
import type { TokenUsage } from '../../types/statistics';

interface TokenChartProps {
  tokens: TokenUsage;
}

export function TokenChart({ tokens }: TokenChartProps) {
  const totalTokens = tokens.input + tokens.output;
  const byModel = Object.entries(tokens.by_model);

  if (byModel.length === 0) {
    return (
      <div className="bg-[#1a1a1a] rounded-xl p-5 border border-[#2a2a2a]">
        <h3 className="text-lg font-semibold mb-4">Token Usage by Model</h3>
        <div className="h-[200px] flex items-center justify-center text-[#a0a0a0]">
          No data available
        </div>
      </div>
    );
  }

  const sortedModels = byModel
    .map(([model, t]) => ({
      model,
      total: t.input + t.output,
      ...t,
    }))
    .filter(m => m.total > 0)
    .sort((a, b) => b.total - a.total);

  const maxTokens = Math.max(...sortedModels.map(m => m.total));
  const colors = ['#3b82f6', '#22c55e', '#a855f7', '#f59e0b', '#ef4444', '#ec4899'];

  return (
    <div className="bg-[#1a1a1a] rounded-xl p-5 border border-[#2a2a2a]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Token Usage by Model</h3>
        <span className="text-sm text-[#a0a0a0]">{sortedModels.length} model{sortedModels.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="space-y-4">
        {sortedModels.map((model, index) => {
          const percentage = maxTokens > 0 ? (model.total / maxTokens) * 100 : 0;
          const color = colors[index % colors.length];

          return (
            <div key={model.model}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-sm truncate" title={model.model}>
                    {model.model}
                  </span>
                </div>
                <span className="text-sm font-semibold shrink-0 ml-3" style={{ color }}>{formatTokens(model.total)}</span>
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
      <div className="mt-5 pt-4 border-t border-[#2a2a2a] flex items-center justify-between">
        <span className="text-[#a0a0a0] text-sm">Total Tokens</span>
        <span className="font-bold text-lg">{formatTokens(totalTokens)}</span>
      </div>
    </div>
  );
}
