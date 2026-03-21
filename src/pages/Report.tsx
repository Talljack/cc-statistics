import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFilterStore } from '../stores/filterStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useStatistics, useSessions } from '../hooks/useStatistics';
import { Header } from '../components/layout/Header';
import { formatTokens, formatNumber, formatCost, formatDuration, calculateCustomCost } from '../lib/utils';
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
  date: string;       // YYYY-MM-DD
  label: string;      // display label
  sessions: number;
  tokens: number;
  cost: number;
  duration: number;
}

export function Report() {
  const { t } = useTranslation();
  const { selectedProject, timeFilter } = useFilterStore();
  const { showCost, customPricingEnabled, customPricing } = useSettingsStore();
  const navigate = useNavigate();
  const { data: stats, isLoading: statsLoading } = useStatistics(selectedProject, timeFilter);
  const { data: sessions, isLoading: sessionsLoading } = useSessions(selectedProject, timeFilter);

  const isLoading = statsLoading || sessionsLoading;

  // Cost calculation
  const displayCost = useMemo(() => {
    if (!stats) return 0;
    return customPricingEnabled
      ? calculateCustomCost(stats.tokens, customPricing)
      : stats.cost_usd;
  }, [stats, customPricingEnabled, customPricing]);

  // Project leaderboard
  const projectRankings = useMemo(() => {
    if (!sessions) return [];
    const map = new Map<string, { sessions: number; tokens: number; cost: number; duration: number }>();
    for (const s of sessions) {
      const existing = map.get(s.project_name) || { sessions: 0, tokens: 0, cost: 0, duration: 0 };
      existing.sessions += 1;
      existing.tokens += s.total_tokens;
      existing.cost += s.cost_usd;
      existing.duration += s.duration_ms;
      map.set(s.project_name, existing);
    }
    return Array.from(map.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.tokens - a.tokens);
  }, [sessions]);

  // Daily trend
  const dailyTrend = useMemo(() => {
    if (!sessions || sessions.length === 0) return [];
    const map = new Map<string, DailyBucket>();
    for (const s of sessions) {
      if (!s.timestamp) continue;
      const date = s.timestamp.slice(0, 10); // YYYY-MM-DD
      const existing = map.get(date) || { date, label: '', sessions: 0, tokens: 0, cost: 0, duration: 0 };
      existing.sessions += 1;
      existing.tokens += s.total_tokens;
      existing.cost += s.cost_usd;
      existing.duration += s.duration_ms;
      map.set(date, existing);
    }
    const sorted = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
    // Format labels
    for (const bucket of sorted) {
      const d = new Date(bucket.date);
      bucket.label = `${d.getMonth() + 1}/${d.getDate()}`;
    }
    return sorted;
  }, [sessions]);

  const maxDailyTokens = Math.max(...dailyTrend.map((d) => d.tokens), 1);
  const maxDailySessions = Math.max(...dailyTrend.map((d) => d.sessions), 1);

  const handleRefresh = () => {};

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
        <div className="text-[#a0a0a0]">{t('report.loading')}</div>
      </div>
    );
  }

  const totalTokens = stats
    ? stats.tokens.input + stats.tokens.output + stats.tokens.cache_read + stats.tokens.cache_creation
    : 0;

  return (
    <div className="min-h-screen bg-[#0f0f0f] flex flex-col">
      <Header onRefresh={handleRefresh} isRefreshing={false} />

      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={() => navigate('/')}
              className="p-2 rounded-lg hover:bg-[#2a2a2a] transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-[#a0a0a0]" />
            </button>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-[#3b82f6]" />
              <h2 className="text-xl font-semibold">{t('report.title')}</h2>
            </div>
          </div>

          {/* Core Metrics */}
          <section className="mb-8">
            <h3 className="text-sm font-semibold text-[#a0a0a0] uppercase tracking-wider mb-3">{t('report.overview')}</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
              <MetricCard icon={<MessageSquare className="w-4 h-4" />} color="#3b82f6" label={t('dashboard.sessions')} value={formatNumber(stats?.sessions ?? 0)} />
              <MetricCard icon={<FileText className="w-4 h-4" />} color="#22c55e" label={t('dashboard.instructions')} value={formatNumber(stats?.instructions ?? 0)} />
              <MetricCard icon={<Clock className="w-4 h-4" />} color="#a855f7" label={t('dashboard.duration')} value={stats?.duration_formatted ?? '0s'} />
              <MetricCard icon={<Cpu className="w-4 h-4" />} color="#f59e0b" label={t('dashboard.tokens')} value={formatTokens(totalTokens)} />
              {showCost && (
                <MetricCard icon={<DollarSign className="w-4 h-4" />} color="#ef4444" label={t('dashboard.cost')} value={formatCost(displayCost)} />
              )}
            </div>
          </section>

          {/* Daily Trend */}
          {dailyTrend.length > 1 && (
            <section className="mb-8">
              <h3 className="text-sm font-semibold text-[#a0a0a0] uppercase tracking-wider mb-3">{t('report.dailyActivity')}</h3>
              <div className="bg-[#1a1a1a] rounded-xl border border-[#2a2a2a] p-5">
                {/* Token bars */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-[#808080]">{t('dashboard.tokens')}</span>
                  <span className="text-xs text-[#808080]">{t('dashboard.sessions')}</span>
                </div>
                <div className="flex items-end gap-1" style={{ height: 120 }}>
                  {dailyTrend.map((day) => {
                    const tokenH = (day.tokens / maxDailyTokens) * 100;
                    const sessionH = (day.sessions / maxDailySessions) * 100;
                    return (
                      <div key={day.date} className="flex-1 flex flex-col items-center gap-0.5 group relative">
                        {/* Tooltip */}
                        <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                          <div className="bg-[#333] rounded-lg px-3 py-2 text-xs whitespace-nowrap shadow-xl">
                            <div className="font-medium mb-1">{day.date}</div>
                            <div className="text-[#f59e0b]">{formatTokens(day.tokens)} {t('cost.tokens')}</div>
                            <div className="text-[#3b82f6]">{day.sessions} {t('dashboard.sessions').toLowerCase()}</div>
                            {showCost && <div className="text-[#ef4444]">{formatCost(day.cost)}</div>}
                          </div>
                        </div>
                        {/* Bars */}
                        <div className="w-full flex gap-px" style={{ height: `${Math.max(tokenH, 4)}%` }}>
                          <div
                            className="flex-1 rounded-t-sm bg-[#f59e0b]/70 transition-all group-hover:bg-[#f59e0b]"
                            style={{ height: '100%' }}
                          />
                          <div
                            className="flex-1 rounded-t-sm bg-[#3b82f6]/70 transition-all group-hover:bg-[#3b82f6]"
                            style={{ height: `${Math.max((sessionH / Math.max(tokenH, 1)) * 100, 8)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Date labels */}
                <div className="flex gap-1 mt-1">
                  {dailyTrend.map((day, i) => (
                    <div key={day.date} className="flex-1 text-center">
                      {(dailyTrend.length <= 14 || i % Math.ceil(dailyTrend.length / 14) === 0) && (
                        <span className="text-[10px] text-[#606060]">{day.label}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Project Leaderboard */}
          {projectRankings.length > 0 && (
            <section className="mb-8">
              <h3 className="text-sm font-semibold text-[#a0a0a0] uppercase tracking-wider mb-3">
                {t('report.projectLeaderboard')}
                <span className="text-[#606060] font-normal ml-2">{projectRankings.length} {t('report.projects')}</span>
              </h3>
              <div className="bg-[#1a1a1a] rounded-xl border border-[#2a2a2a] overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#2a2a2a] text-[#a0a0a0]">
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
                      <tr key={project.name} className="border-b border-[#2a2a2a] hover:bg-[#222] transition-colors">
                        <td className="px-4 py-3 text-[#606060]">{index + 1}</td>
                        <td className="px-4 py-3">
                          <span className="text-[#3b82f6]">{project.name}</span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono">{formatNumber(project.sessions)}</td>
                        <td className="px-4 py-3 text-right font-mono text-[#f59e0b]">{formatTokens(project.tokens)}</td>
                        {showCost && (
                          <td className="px-4 py-3 text-right font-mono text-[#ef4444]">{formatCost(project.cost)}</td>
                        )}
                        <td className="px-4 py-3 text-right text-[#a0a0a0]">{formatDuration(project.duration)}</td>
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
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <div style={{ color }}>{icon}</div>
        <span className="text-xs text-[#808080]">{label}</span>
      </div>
      <div className="text-xl font-bold" style={{ color }}>{value}</div>
    </div>
  );
}
