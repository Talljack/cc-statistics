import { formatNumber } from '../../lib/utils';

interface ToolUsageChartProps {
  toolUsage: Record<string, number>;
}

export function ToolUsageChart({ toolUsage }: ToolUsageChartProps) {
  const entries = Object.entries(toolUsage);

  if (entries.length === 0) {
    return (
      <div className="bg-[#1a1a1a] rounded-xl p-5 border border-[#2a2a2a]">
        <h3 className="text-lg font-semibold mb-4">Tool Usage</h3>
        <div className="h-[200px] flex items-center justify-center text-[#a0a0a0]">
          No data available
        </div>
      </div>
    );
  }

  const sorted = entries
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  const maxCount = sorted[0][1];
  const totalCalls = entries.reduce((sum, [, count]) => sum + count, 0);
  const colors = ['#3b82f6', '#22c55e', '#a855f7', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#84cc16'];

  return (
    <div className="bg-[#1a1a1a] rounded-xl p-5 border border-[#2a2a2a]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Tool Usage</h3>
        <span className="text-sm text-[#a0a0a0]">{formatNumber(totalCalls)} calls</span>
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
      {entries.length > 15 && (
        <div className="mt-3 text-sm text-[#a0a0a0] text-center">
          +{entries.length - 15} more tools
        </div>
      )}
    </div>
  );
}
