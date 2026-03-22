import { useNavigate } from 'react-router-dom';
import { useFilterStore } from '../stores/filterStore';
import { useInstructions } from '../hooks/useStatistics';
import { Header } from '../components/layout/Header';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from '../lib/i18n';

export function Instructions() {
  const { t } = useTranslation();
  const { selectedProject, activeTimeRange, selectedProvider } = useFilterStore();
  const navigate = useNavigate();
  const { data: instructions, isLoading } = useInstructions(selectedProject, activeTimeRange, selectedProvider);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
        <div className="text-[#a0a0a0]">{t('instructions.loading')}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] flex flex-col">
      <Header onRefresh={() => {}} isRefreshing={false} />

      <main className="flex-1 p-6 overflow-auto">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate('/')}
            className="p-2 rounded-lg hover:bg-[#2a2a2a] transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-[#a0a0a0]" />
          </button>
          <h2 className="text-xl font-semibold">
            {t('instructions.title')}
            <span className="text-[#a0a0a0] text-sm font-normal ml-2">
              {instructions?.length ?? 0} {t('common.total')}
            </span>
          </h2>
        </div>

        {!instructions || instructions.length === 0 ? (
          <div className="bg-[#1a1a1a] rounded-xl p-8 border border-[#2a2a2a] text-center text-[#a0a0a0]">
            {t('instructions.noData')}
          </div>
        ) : (
          <div className="space-y-3">
            {instructions.map((item, index) => (
              <div
                key={`${item.session_id}-${index}`}
                className="bg-[#1a1a1a] rounded-xl border border-[#2a2a2a] p-4 hover:border-[#333] transition-colors"
              >
                <div className="flex items-center gap-3 mb-2 text-xs text-[#606060]">
                  <span>{formatTimestamp(item.timestamp)}</span>
                  <span className="text-[#3b82f6]">{item.project_name}</span>
                  <span className="font-mono">{item.session_id.slice(0, 8)}</span>
                </div>
                <p className="text-sm text-[#d0d0d0] whitespace-pre-wrap break-words leading-relaxed">
                  {item.content}
                </p>
              </div>
            ))}
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
