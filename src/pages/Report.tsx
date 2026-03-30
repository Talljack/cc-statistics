import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFilterStore } from '../stores/filterStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useStatistics, useSessions } from '../hooks/useStatistics';
import { useCostMetrics } from '../hooks/useCostMetrics';
import { Header } from '../components/layout/Header';
import { ExportButton } from '../components/export/ExportButton';
import { formatTokens, formatNumber, formatCost, formatDuration } from '../lib/utils';
import { useTranslation } from '../lib/i18n';
import {
  ArrowLeft,
  BarChart3,
  MessageSquare,
  FileText,
  Clock,
  Cpu,
  DollarSign,
} from 'lucide-react';

interface DailyBucket {
  date: string;
  label: string;
  sessions: number;
  tokens: number;
  cost: number;
  duration: number;
}

export function Report() {
  const { t } = useTranslation();
  const { selectedProject, activeTimeRange, selectedProvider } = useFilterStore();
  const { showCost } = useSettingsStore();
  const navigate = useNavigate();
  const { data: stats, isLoading: statsLoading } = useStatistics(
    selectedProject,
    activeTimeRange,
    selectedProvider,
  );
  const { data: sessions, isLoading: sessionsLoading } = useSessions(
    selectedProject,
    activeTimeRange,
    selectedProvider,
  );
  const costMetrics = useCostMetrics(sessions);

  const isLoading = statsLoading || sessionsLoading;
  const displayCost = costMetrics.totalCost;

  const projectRankings = useMemo(() => {
    if (!sessions) return [];
    const map = new Map<string, { sessions: number; tokens: number; cost: number; duration: number }>();
    for (const s of sessions) {
      const existing = map.get(s.project_name) || { sessions: 0, tokens: 0, cost: 0, duration: 0 };
      existing.sessions += 1;
      existing.tokens += s.total_tokens;
      existing.cost += costMetrics.getSessionCost(s);
      existing.duration += s.duration_ms;
      map.set(s.project_name, existing);
    }
    return Array.from(map.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.tokens - a.tokens);
  }, [costMetrics, sessions]);

  const dailyTrend = useMemo(() => {
    if (!sessions || sessions.length === 0) return [];
    const map = new Map<string, DailyBucket>();
    for (const s of sessions) {
      if (!s.timestamp) continue;
      const date = s.timestamp.slice(0, 10);
      const existing = map.get(date) || { date, label: '', sessions: 0, tokens: 0, cost: 0, duration: 0 };
      existing.sessions += 1;
      existing.tokens += s.total_tokens;
      existing.cost += costMetrics.getSessionCost(s);
      existing.duration += s.duration_ms;
      map.set(date, existing);
    }
    const sorted = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
    for (const bucket of sorted) {
      const d = new Date(bucket.date);
      bucket.label = `${d.getMonth() + 1}/${d.getDate()}`;
    }
    return sorted;
  }, [costMetrics, sessions]);

  const maxDailyTokens = Math.max(...dailyTrend.map((d) => d.tokens), 1);
  const maxDailySessions = Math.max(...dailyTrend.map((d) => d.sessions), 1);

  const handleRefresh = () => {};

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-base)] flex items-center justify-center">
        <div className="text-[var(--color-text-secondary)]">{t('report.loading')}</div>
      </div>
    );
  }

  const totalTokens = stats
    ? stats.tokens.input + stats.tokens.output + stats.tokens.cache_read + stats.tokens.cache_creation
    : 0;

  const exportTitle = `CC Statistics Report — ${selectedProject || 'All Projects'}`;

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)] flex flex-col">
      <Header onRefresh={handleRefresh} isRefreshing={false} />

      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/')}
                className="p-2 rounded-lg hover:bg-[var(--color-bg-hover)] transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-[var(--color-text-secondary)]" />
              </button>
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-[var(--color-accent-blue)]" />
                <h2 className="text-xl font-semibold">{t('report.title')}</h2>
              </div>
            </div>
            <ExportButton sessions={sessions ?? []} title={exportTitle} />
          </div>

          <section className="mb-8">
            <h3 className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-3">{t('report.overview')}</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
              <MetricCard icon={<MessageSquare className="w-4 h-4" />} color="var(--color-accent-blue)" label={t('dashboard.sessions')} value={formatNumber(stats?.sessions ?? 0)} />
              <MetricCard icon={<FileText className="w-4 h-4" />} color="var(--color-accent-green)" label={t('dashboard.instructions')} value={formatNumber(stats?.instructions ?? 0)} />
              <MetricCard icon={<Clock className="w-4 h-4" />} color="var(--color-accent-purple)" label={t('dashboard.duration')} value={stats?.duration_formatted ?? '0s'} />
              <MetricCard icon={<Cpu className="w-4 h-4" />} color="var(--color-accent-yellow)" label={t('dashboard.tokens')} value={formatTokens(totalTokens)} />
              {showCost && (
                <MetricCard icon={<DollarSign className="w-4 h-4" />} color="var(--color-accent-red)" label={t('dashboard.cost')} value={formatCost(displayCost)} />
              )}
            </div>
          </section>

          {dailyTrend.length > 0 && (
            <section className="mb-8">
              <h3 className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-3">{t('report.dailyActivity')}</h3>
              <div className="bg-[var(--color-bg-surface)] rounded-xl border border-[var(--color-border-base)] p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-[var(--color-text-tertiary)]">{t('dashboard.tokens')}</span>
                  <span className="text-xs text-[var(--color-text-tertiary)]">{t('dashboard.sessions')}</span>
                </div>
                <div className="flex items-end gap-1" style={{ height: 120 }}>
                  {dailyTrend.map((day) => {
                    const tokenH = (day.tokens / maxDailyTokens) * 100;
                    const sessionH = (day.sessions / maxDailySessions) * 100;
                    return (
                      <div key={day.date} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                        <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                          <div className="bg-[var(--color-bg-active)] rounded-lg px-3 py-2 text-xs whitespace-nowrap shadow-xl">
                            <div className="font-medium mb-1">{day.date}</div>
                            <div style={{ color: 'var(--color-accent-yellow)' }}>{formatTokens(day.tokens)} {t('cost.tokens')}</div>
                            <div style={{ color: 'var(--color-accent-blue)' }}>{day.sessions} {t('dashboard.sessions').toLowerCase()}</div>
                            {showCost && <div style={{ color: 'var(--color-accent-red)' }}>{formatCost(day.cost)}</div>}
                          </div>
                        </div>
                        <div className="w-full flex gap-px" style={{ height: Math.max((day.tokens / maxDailyTokens) * 120, 4) }}>
                          <div className="flex-1 rounded-t-sm transition-all" style={{ height: '100%', backgroundColor: 'color-mix(in srgb, var(--color-accent-yellow) 70%, transparent)' }} />
                          <div className="flex-1 rounded-t-sm transition-all" style={{ height: `${Math.max((sessionH / Math.max(tokenH, 1)) * 100, 8)}%`, backgroundColor: 'color-mix(in srgb, var(--color-accent-blue) 70%, transparent)' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-1 mt-1">
                  {dailyTrend.map((day, i) => (
                    <div key={day.date} className="flex-1 text-center">
                      {(dailyTrend.length <= 14 || i % Math.ceil(dailyTrend.length / 14) === 0) && (
                        <span className="text-[10px] text-[var(--color-text-muted)]">{day.label}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {projectRankings.length > 0 && (
            <section className="mb-8">
              <h3 className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-3">
                {t('report.projectLeaderboard')}
                <span className="text-[var(--color-text-muted)] font-normal ml-2">{projectRankings.length} {t('report.projects')}</span>
              </h3>
              <div className="bg-[var(--color-bg-surface)] rounded-xl border border-[var(--color-border-base)] overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border-base)] text-[var(--color-text-secondary)]">
                      <th className="text-left px-4 py-3 font-medium w-8">#</th>
                      <th className="text-left px-4 py-3 font-medium">{t('sessions.project')}</th>
                      <th className="text-right px-4 py-3 font-medium">{t('dashboard.sessions')}</th>
                      <th className="text-right px-4 py-3 font-medium">{t('dashboard.tokens')}</th>
                      {showCost && <th className="text-right px-4 py-3 font-medium">{t('dashboard.cost')}</th>}
                      <th className="text-right px-4 py-3 font-medium">{t('dashboard.duration')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectRankings.map((project, index) => (
                      <tr key={project.name} className="border-b border-[var(--color-border-base)] hover:bg-[var(--color-bg-elevated)] transition-colors">
                        <td className="px-4 py-3 text-[var(--color-text-muted)]">{index + 1}</td>
                        <td className="px-4 py-3"><span style={{ color: 'var(--color-accent-blue)' }}>{project.name}</span></td>
                        <td className="px-4 py-3 text-right font-mono">{formatNumber(project.sessions)}</td>
                        <td className="px-4 py-3 text-right font-mono" style={{ color: 'var(--color-accent-yellow)' }}>{formatTokens(project.tokens)}</td>
                        {showCost && <td className="px-4 py-3 text-right font-mono" style={{ color: 'var(--color-accent-red)' }}>{formatCost(project.cost)}</td>}
                        <td className="px-4 py-3 text-right text-[var(--color-text-secondary)]">{formatDuration(project.duration)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

function MetricCard({
  icon,
  color,
  label,
  value,
}: {
  icon: React.ReactNode;
  color: string;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-base)] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <div style={{ color }}>{icon}</div>
        <span className="text-xs text-[var(--color-text-tertiary)]">{label}</span>
      </div>
      <div className="text-xl font-bold" style={{ color }}>{value}</div>
    </div>
  );
}
