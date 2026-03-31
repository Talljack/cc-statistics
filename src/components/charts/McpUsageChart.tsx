import { formatNumber } from '../../lib/utils';
import { useTranslation } from '../../lib/i18n';

interface McpUsageChartProps {
  mcpUsage: Record<string, number>;
}

function parseMcpName(fullName: string): { server: string; method: string } {
  // Format: mcp__{server}__{method}
  const parts = fullName.replace(/^mcp__/, '').split('__');
  if (parts.length >= 2) {
    return { server: parts[0], method: parts.slice(1).join('__') };
  }
  return { server: fullName, method: '' };
}

interface ServerGroup {
  server: string;
  methods: { method: string; count: number }[];
  total: number;
}

export function McpUsageChart({ mcpUsage }: McpUsageChartProps) {
  const { t } = useTranslation();
  const entries = Object.entries(mcpUsage);

  if (entries.length === 0) {
    return (
      <div className="bg-[var(--color-bg-surface)] rounded-xl p-5 border border-[var(--color-border-base)]">
        <h3 className="text-lg font-semibold mb-4">{t('chart.mcpUsage')}</h3>
        <div className="h-[200px] flex items-center justify-center text-[var(--color-text-secondary)]">
          {t('common.noData')}
        </div>
      </div>
    );
  }

  // Group by server
  const serverMap = new Map<string, { method: string; count: number }[]>();
  for (const [name, count] of entries) {
    const { server, method } = parseMcpName(name);
    if (!serverMap.has(server)) {
      serverMap.set(server, []);
    }
    serverMap.get(server)!.push({ method, count });
  }

  const groups: ServerGroup[] = Array.from(serverMap.entries())
    .map(([server, methods]) => ({
      server,
      methods: methods.sort((a, b) => b.count - a.count),
      total: methods.reduce((sum, m) => sum + m.count, 0),
    }))
    .sort((a, b) => b.total - a.total);

  const totalCalls = entries.reduce((sum, [, count]) => sum + count, 0);
  const maxTotal = Math.max(...groups.map(g => g.total));
  const serverColors = ['#06b6d4', '#a855f7', '#f59e0b', '#3b82f6', '#22c55e', '#ef4444'];

  return (
    <div className="bg-[var(--color-bg-surface)] rounded-xl p-5 border border-[var(--color-border-base)]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">{t('chart.mcpUsage')}</h3>
        <span className="text-sm text-[var(--color-text-secondary)]">{formatNumber(totalCalls)} {t('common.calls')}</span>
      </div>
      <div className="space-y-4">
        {groups.map((group, gIndex) => {
          const color = serverColors[gIndex % serverColors.length];
          const percentage = maxTotal > 0 ? (group.total / maxTotal) * 100 : 0;

          return (
            <div key={group.server}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-sm font-medium truncate" title={group.server}>
                    {group.server}
                  </span>
                </div>
                <span className="text-sm font-semibold shrink-0 ml-3" style={{ color }}>
                  {formatNumber(group.total)}
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
              {group.methods.length > 1 && (
                <div className="ml-4 mt-1.5 space-y-1">
                  {group.methods.slice(0, 5).map((m) => (
                    <div key={m.method} className="flex items-center justify-between text-xs text-[var(--color-text-tertiary)]">
                      <span className="truncate mr-2">{m.method}</span>
                      <span>{formatNumber(m.count)}</span>
                    </div>
                  ))}
                  {group.methods.length > 5 && (
                    <div className="text-xs text-[var(--color-text-muted)]">+{group.methods.length - 5} {t('chart.more')}</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
