import { useNavigate } from 'react-router-dom';
import { useFilterStore } from '../stores/filterStore';
import { useStatistics } from '../hooks/useStatistics';
import { Header } from '../components/layout/Header';
import { formatNumber } from '../lib/utils';
import { useTranslation } from '../lib/i18n';
import { ArrowLeft, Zap } from 'lucide-react';

export function Skills() {
  const { t } = useTranslation();
  const { selectedProject, activeTimeRange } = useFilterStore();
  const navigate = useNavigate();
  const { data: stats, isLoading } = useStatistics(selectedProject, activeTimeRange);

  const handleRefresh = () => {};

  const entries = stats ? Object.entries(stats.skill_usage).sort((a, b) => b[1] - a[1]) : [];
  const totalCalls = entries.reduce((sum, [, count]) => sum + count, 0);
  const maxCount = entries.length > 0 ? entries[0][1] : 0;
  const colors = ['#22c55e', '#3b82f6', '#a855f7', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#84cc16'];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
        <div className="text-[#a0a0a0]">{t('skills.loading')}</div>
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
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-[#22c55e]" />
            <h2 className="text-xl font-semibold">
              Skills
              <span className="text-[#a0a0a0] text-sm font-normal ml-2">
                {entries.length} {t('skills.skills')} · {formatNumber(totalCalls)} {t('common.calls')}
              </span>
            </h2>
          </div>
        </div>

        {entries.length === 0 ? (
          <div className="bg-[#1a1a1a] rounded-xl p-8 border border-[#2a2a2a] text-center text-[#a0a0a0]">
            {t('skills.noData')}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Bar Chart */}
            <div className="bg-[#1a1a1a] rounded-xl p-5 border border-[#2a2a2a]">
              <div className="space-y-3">
                {entries.map(([name, count], index) => {
                  const percentage = maxCount > 0 ? (count / maxCount) * 100 : 0;
                  const pctOfTotal = totalCalls > 0 ? ((count / totalCalls) * 100).toFixed(1) : '0';
                  const color = colors[index % colors.length];

                  return (
                    <div key={name}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm truncate mr-3" title={name}>
                          {name}
                        </span>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-xs text-[#606060]">{pctOfTotal}%</span>
                          <span className="text-sm font-semibold min-w-[40px] text-right" style={{ color }}>
                            {formatNumber(count)}
                          </span>
                        </div>
                      </div>
                      <div className="h-2.5 bg-[#2a2a2a] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${percentage}%`, backgroundColor: color, opacity: 0.8 }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Table */}
            <div className="bg-[#1a1a1a] rounded-xl border border-[#2a2a2a] overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2a2a2a] text-[#a0a0a0]">
                    <th className="text-left px-4 py-3 font-medium">#</th>
                    <th className="text-left px-4 py-3 font-medium">{t('skills.skill')}</th>
                    <th className="text-right px-4 py-3 font-medium">{t('skills.calls')}</th>
                    <th className="text-right px-4 py-3 font-medium">{t('skills.share')}</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map(([name, count], index) => (
                    <tr key={name} className="border-b border-[#2a2a2a] hover:bg-[#222] transition-colors">
                      <td className="px-4 py-3 text-[#606060]">{index + 1}</td>
                      <td className="px-4 py-3">
                        <span className="text-[#22c55e]">{name}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {formatNumber(count)}
                      </td>
                      <td className="px-4 py-3 text-right text-[#a0a0a0]">
                        {totalCalls > 0 ? ((count / totalCalls) * 100).toFixed(1) : '0'}%
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
