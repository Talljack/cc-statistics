import { useNavigate } from 'react-router-dom';
import { useFilterStore } from '../stores/filterStore';
import { useStatistics } from '../hooks/useStatistics';
import { Header } from '../components/layout/Header';
import { formatNumber } from '../lib/utils';
import { useTranslation } from '../lib/i18n';
import { ArrowLeft, Plug } from 'lucide-react';

interface ServerGroup {
  server: string;
  methods: { method: string; count: number }[];
  total: number;
}

function parseMcpName(fullName: string): { server: string; method: string } {
  const parts = fullName.replace(/^mcp__/, '').split('__');
  if (parts.length >= 2) {
    return { server: parts[0], method: parts.slice(1).join('__') };
  }
  return { server: fullName, method: '' };
}

export function McpServers() {
  const { t } = useTranslation();
  const { selectedProject, activeTimeRange } = useFilterStore();
  const navigate = useNavigate();
  const { data: stats, isLoading } = useStatistics(selectedProject, activeTimeRange);

  const handleRefresh = () => {};

  // Group by server
  const entries = stats ? Object.entries(stats.mcp_usage) : [];
  const totalCalls = entries.reduce((sum, [, count]) => sum + count, 0);

  const serverMap = new Map<string, { method: string; count: number }[]>();
  for (const [name, count] of entries) {
    const { server, method } = parseMcpName(name);
    if (!serverMap.has(server)) serverMap.set(server, []);
    serverMap.get(server)!.push({ method, count });
  }

  const groups: ServerGroup[] = Array.from(serverMap.entries())
    .map(([server, methods]) => ({
      server,
      methods: methods.sort((a, b) => b.count - a.count),
      total: methods.reduce((sum, m) => sum + m.count, 0),
    }))
    .sort((a, b) => b.total - a.total);

  const maxTotal = groups.length > 0 ? groups[0].total : 0;
  const serverColors = ['#06b6d4', '#a855f7', '#f59e0b', '#3b82f6', '#22c55e', '#ef4444', '#ec4899', '#84cc16'];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-base)] flex items-center justify-center">
        <div className="text-[var(--color-text-secondary)]">{t('mcp.loading')}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)] flex flex-col">
      <Header onRefresh={handleRefresh} isRefreshing={false} />

      <main className="flex-1 p-6 overflow-auto">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate('/')}
            className="p-2 rounded-lg hover:bg-[var(--color-bg-hover)] transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-[var(--color-text-secondary)]" />
          </button>
          <div className="flex items-center gap-2">
            <Plug className="w-5 h-5 text-[#06b6d4]" />
            <h2 className="text-xl font-semibold">
              {t('mcp.title')}
              <span className="text-[var(--color-text-secondary)] text-sm font-normal ml-2">
                {groups.length} {t('mcp.servers')} · {formatNumber(totalCalls)} {t('common.calls')}
              </span>
            </h2>
          </div>
        </div>

        {groups.length === 0 ? (
          <div className="bg-[var(--color-bg-surface)] rounded-xl p-8 border border-[var(--color-border-base)] text-center text-[var(--color-text-secondary)]">
            {t('mcp.noData')}
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((group, gIndex) => {
              const color = serverColors[gIndex % serverColors.length];
              const percentage = maxTotal > 0 ? (group.total / maxTotal) * 100 : 0;

              return (
                <div key={group.server} className="bg-[var(--color-bg-surface)] rounded-xl border border-[var(--color-border-base)] overflow-hidden">
                  {/* Server header */}
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <span className="text-sm font-semibold truncate" title={group.server}>
                          {group.server}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-3">
                        <span className="text-xs text-[var(--color-text-muted)]">
                          {group.methods.length} {group.methods.length !== 1 ? t('mcp.methods') : t('mcp.method')}
                        </span>
                        <span className="text-sm font-bold" style={{ color }}>
                          {formatNumber(group.total)}
                        </span>
                      </div>
                    </div>
                    <div className="h-2.5 bg-[var(--color-bg-hover)] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${percentage}%`, backgroundColor: color, opacity: 0.8 }}
                      />
                    </div>
                  </div>

                  {/* Methods table */}
                  {group.methods.length > 0 && (
                    <div className="border-t border-[var(--color-border-base)]">
                      <table className="w-full text-sm">
                        <tbody>
                          {group.methods.map((m) => (
                            <tr key={m.method} className="border-b border-[var(--color-border-base)] last:border-b-0 hover:bg-[var(--color-bg-elevated)] transition-colors">
                              <td className="px-4 py-2.5 pl-9 text-[var(--color-text-secondary)] truncate" title={m.method}>
                                {m.method || t('mcp.default')}
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono w-24" style={{ color }}>
                                {formatNumber(m.count)}
                              </td>
                              <td className="px-4 py-2.5 text-right text-[var(--color-text-muted)] w-20">
                                {group.total > 0 ? ((m.count / group.total) * 100).toFixed(0) : '0'}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
