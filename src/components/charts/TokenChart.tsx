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

  // Sort by total tokens descending
  const sortedModels = byModel
    .map(([model, t]) => ({
      model,
      total: t.input + t.output,
      ...t,
    }))
    .sort((a, b) => b.total - a.total);

  const maxTokens = Math.max(...sortedModels.map(m => m.total));

  const colors = ['#3b82f6', '#22c55e', '#a855f7', '#f59e0b', '#ef4444', '#ec4899'];

  return (
    <div className="bg-[#1a1a1a] rounded-xl p-5 border border-[#2a2a2a]">
      <h3 className="text-lg font-semibold mb-4">Token Usage by Model</h3>
      <div className="space-y-4">
        {sortedModels.map((model, index) => {
          const percentage = maxTokens > 0 ? (model.total / maxTokens) * 100 : 0;
          const color = colors[index % colors.length];

          return (
            <div key={model.model}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm truncate max-w-[200px]" title={model.model}>
                  {model.model}
                </span>
                <span className="text-sm font-medium">{formatTokens(model.total)}</span>
              </div>
              <div className="h-6 bg-[#2a2a2a] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${percentage}%`,
                    backgroundColor: color,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-6 pt-4 border-t border-[#2a2a2a] flex items-center justify-between">
        <span className="text-[#a0a0a0]">Total</span>
        <span className="font-semibold">{formatTokens(totalTokens)}</span>
      </div>
    </div>
  );
}
