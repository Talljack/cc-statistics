import { useNavigate } from 'react-router-dom';
import { useFilterStore } from '../stores/filterStore';
import { useSessions } from '../hooks/useStatistics';
import { Header } from '../components/layout/Header';
import { formatTokens, formatNumber, formatCost } from '../lib/utils';
import { ArrowLeft } from 'lucide-react';

export function Sessions() {
  const { selectedProject, timeFilter } = useFilterStore();
  const navigate = useNavigate();
  const { data: sessions, isLoading } = useSessions(selectedProject, timeFilter);

  const handleRefresh = () => {
    // Sessions page doesn't need a full refresh - query will auto-refetch
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
        <div className="text-[#a0a0a0]">Loading sessions...</div>
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
            Sessions
            <span className="text-[#a0a0a0] text-sm font-normal ml-2">
              {sessions?.length ?? 0} total
            </span>
          </h2>
        </div>

        {!sessions || sessions.length === 0 ? (
          <div className="bg-[#1a1a1a] rounded-xl p-8 border border-[#2a2a2a] text-center text-[#a0a0a0]">
            No sessions found
          </div>
        ) : (
          <div className="bg-[#1a1a1a] rounded-xl border border-[#2a2a2a] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2a2a2a] text-[#a0a0a0]">
                    <th className="text-left px-4 py-3 font-medium">Time</th>
                    <th className="text-left px-4 py-3 font-medium">Project</th>
                    <th className="text-left px-4 py-3 font-medium">Duration</th>
                    <th className="text-right px-4 py-3 font-medium">Tokens</th>
                    <th className="text-right px-4 py-3 font-medium">Cost</th>
                    <th className="text-right px-4 py-3 font-medium">Instructions</th>
                    <th className="text-left px-4 py-3 font-medium">Model</th>
                    <th className="text-left px-4 py-3 font-medium">Branch</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((session) => (
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
                      <td className="px-4 py-3 text-right font-mono text-[#ef4444]">
                        {formatCost(session.cost_usd)}
                      </td>
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
