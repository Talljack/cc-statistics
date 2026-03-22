import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFilterStore } from '../stores/filterStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useSessions } from '../hooks/useStatistics';
import { Header } from '../components/layout/Header';
import { formatTokens, formatNumber, formatCost } from '../lib/utils';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from '../lib/i18n';

export function Sessions() {
  const { t } = useTranslation();
  const { selectedProject, activeTimeRange, selectedProvider } = useFilterStore();
  const { showCost, sessionSortField, sessionSortOrder } = useSettingsStore();
  const navigate = useNavigate();
  const { data: sessions, isLoading } = useSessions(selectedProject, activeTimeRange, selectedProvider);

  const sortedSessions = useMemo(() => {
    if (!sessions) return [];
    const sorted = [...sessions];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sessionSortField) {
        case 'timestamp':
          cmp = a.timestamp.localeCompare(b.timestamp);
          break;
        case 'cost_usd':
          cmp = a.cost_usd - b.cost_usd;
          break;
        case 'total_tokens':
          cmp = a.total_tokens - b.total_tokens;
          break;
        case 'duration_ms':
          cmp = a.duration_ms - b.duration_ms;
          break;
      }
      return sessionSortOrder === 'desc' ? -cmp : cmp;
    });
    return sorted;
  }, [sessions, sessionSortField, sessionSortOrder]);

  const handleRefresh = () => {};

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
        <div className="text-[#a0a0a0]">{t('sessions.loading')}</div>
      </div>
    );
  }

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
            {t('sessions.title')}
            <span className="text-[#a0a0a0] text-sm font-normal ml-2">
              {sessions?.length ?? 0} {t('common.total')}
            </span>
          </h2>
        </div>

        {sortedSessions.length === 0 ? (
          <div className="bg-[#1a1a1a] rounded-xl p-8 border border-[#2a2a2a] text-center text-[#a0a0a0]">
            {t('sessions.noData')}
          </div>
        ) : (
          <div className="bg-[#1a1a1a] rounded-xl border border-[#2a2a2a] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2a2a2a] text-[#a0a0a0]">
                    <th className="text-left px-4 py-3 font-medium">{t('sessions.time')}</th>
                    <th className="text-left px-4 py-3 font-medium">{t('sessions.project')}</th>
                    <th className="text-left px-4 py-3 font-medium">{t('sessions.duration')}</th>
                    <th className="text-right px-4 py-3 font-medium">{t('sessions.tokens')}</th>
                    {showCost && (
                      <th className="text-right px-4 py-3 font-medium">{t('sessions.cost')}</th>
                    )}
                    <th className="text-right px-4 py-3 font-medium">{t('sessions.instructions')}</th>
                    <th className="text-left px-4 py-3 font-medium">{t('sessions.model')}</th>
                    <th className="text-left px-4 py-3 font-medium">{t('sessions.branch')}</th>
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
                      <td className="px-4 py-3 text-[#a0a0a0]">
                        {session.duration_formatted}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[#f59e0b]">
                        {formatTokens(session.total_tokens)}
                      </td>
                      {showCost && (
                        <td className="px-4 py-3 text-right font-mono text-[#ef4444]">
                          {formatCost(session.cost_usd)}
                        </td>
                      )}
                      <td className="px-4 py-3 text-right font-mono">
                        {formatNumber(session.instructions)}
                      </td>
                      <td className="px-4 py-3 text-[#a0a0a0] max-w-[200px] truncate" title={session.model}>
                        {session.model}
                      </td>
                      <td className="px-4 py-3 text-[#a0a0a0] max-w-[150px] truncate" title={session.git_branch}>
                        {session.git_branch || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
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
