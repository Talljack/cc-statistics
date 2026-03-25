import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAccountUsage } from '../hooks/useStatistics';
import { Header } from '../components/layout/Header';
import { useTranslation } from '../lib/i18n';
import { ArrowLeft, User, RefreshCw, Clock, BarChart3, AlertTriangle } from 'lucide-react';
import type { ProviderUsage } from '../types/statistics';

const SOURCE_LABELS: Record<string, string> = {
  claude_code: 'Claude Code',
  codex: 'Codex CLI',
  gemini: 'Gemini CLI',
};

const SOURCE_COLORS: Record<string, string> = {
  claude_code: '#f97316',
  codex: '#3b82f6',
  gemini: '#22c55e',
};

function getStatusColor(percentage: number): string {
  if (percentage >= 85) return '#ef4444';
  if (percentage >= 60) return '#f59e0b';
  return '#22c55e';
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return '--';
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    const remainHours = hours % 24;
    return `${days}d ${remainHours}h`;
  }
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function UsageProgressBar({ label, usedPercent, resetSeconds }: {
  label: string;
  usedPercent: number;
  resetSeconds: number;
}) {
  const remaining = Math.max(0, 100 - usedPercent);
  const statusColor = getStatusColor(usedPercent);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-[#a0a0a0]">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold" style={{ color: statusColor }}>
            {remaining.toFixed(0)}%
          </span>
          <span className="text-xs text-[#606060]">remaining</span>
        </div>
      </div>
      <div className="h-3 bg-[#2a2a2a] rounded-full overflow-hidden flex">
        {/* Green = remaining portion */}
        <div
          className="h-full rounded-l-full transition-all duration-700 ease-out"
          style={{
            width: `${remaining}%`,
            backgroundColor: '#22c55e',
            opacity: 0.85,
          }}
        />
        {/* Gray/dark = used portion */}
        <div
          className="h-full rounded-r-full transition-all duration-700 ease-out"
          style={{
            width: `${usedPercent}%`,
            backgroundColor: usedPercent >= 85 ? '#ef4444' : '#444',
            opacity: 0.5,
          }}
        />
      </div>
      {resetSeconds > 0 && (
        <div className="flex items-center gap-1 text-xs text-[#606060]">
          <Clock className="w-3 h-3" />
          <span>Resets in {formatCountdown(resetSeconds)}</span>
        </div>
      )}
    </div>
  );
}

function ProviderCard({ usage, t }: { usage: ProviderUsage; t: (key: string) => string }) {
  const source = usage.source;
  const label = SOURCE_LABELS[source] || source;
  const overallUsed = Math.max(
    usage.sessionUsedPercent,
    usage.weeklyUsedPercent ?? 0
  );
  const statusColor = getStatusColor(overallUsed);

  return (
    <div className="bg-[#1a1a1a] rounded-xl border border-[#2a2a2a] overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#2a2a2a] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: SOURCE_COLORS[source] || '#a855f7' }} />
          <h3 className="text-base font-semibold">{label}</h3>
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: statusColor }}
            title={overallUsed >= 85 ? t('account.nearLimit') : overallUsed >= 60 ? t('account.moderate') : t('account.healthy')}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-lg bg-[#2a2a2a] text-sm">
            {usage.planType}
          </span>
        </div>
      </div>

      {/* Limit reached warning */}
      {usage.limitReached && (
        <div className="mx-5 mt-4 px-3 py-2 rounded-lg bg-[#ef4444]/10 border border-[#ef4444]/30 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-[#ef4444]" />
          <span className="text-sm text-[#ef4444]">{t('account.nearLimit')}</span>
        </div>
      )}

      {/* Usage meters */}
      <div className="p-5 space-y-5">
        <UsageProgressBar
          label={t('account.sessionWindow')}
          usedPercent={usage.sessionUsedPercent}
          resetSeconds={usage.sessionResetSeconds}
        />
        {usage.weeklyUsedPercent != null && (
          <UsageProgressBar
            label={t('account.weeklyWindow')}
            usedPercent={usage.weeklyUsedPercent}
            resetSeconds={usage.weeklyResetSeconds}
          />
        )}

        {/* Info row */}
        <div className="flex items-center gap-3 pt-2 border-t border-[#2a2a2a]">
          {usage.email && (
            <div className="text-xs text-[#606060] truncate">
              {usage.email}
            </div>
          )}
          {usage.creditsBalance != null && (
            <div className="text-xs text-[#a0a0a0] ml-auto">
              Credits: ${usage.creditsBalance.toFixed(2)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AccountUsage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading, isRefetching, error } = useAccountUsage();

  // Live countdown timer
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['account-usage'] });
  }, [queryClient]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex flex-col">
        <Header onRefresh={() => {}} isRefreshing={false} />
        <main className="flex-1 p-6 overflow-auto">
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => navigate('/')} className="p-2 rounded-lg hover:bg-[#2a2a2a] transition-colors">
              <ArrowLeft className="w-5 h-5 text-[#a0a0a0]" />
            </button>
            <div className="flex items-center gap-2">
              <User className="w-5 h-5 text-[#f97316]" />
              <h2 className="text-xl font-semibold">{t('account.title')}</h2>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2].map(i => (
              <div key={i} className="bg-[#1a1a1a] rounded-xl border border-[#2a2a2a] p-5 animate-pulse">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-3 h-3 rounded-full bg-[#2a2a2a]" />
                  <div className="h-5 w-24 bg-[#2a2a2a] rounded" />
                </div>
                <div className="space-y-4">
                  <div className="h-3 bg-[#2a2a2a] rounded-full" />
                  <div className="h-3 bg-[#2a2a2a] rounded-full w-3/4" />
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    );
  }

  const providers = data?.providers || [];

  return (
    <div className="min-h-screen bg-[#0f0f0f] flex flex-col">
      <Header onRefresh={handleRefresh} isRefreshing={isRefetching} />

      <main className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="p-2 rounded-lg hover:bg-[#2a2a2a] transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-[#a0a0a0]" />
            </button>
            <div className="flex items-center gap-2">
              <User className="w-5 h-5 text-[#f97316]" />
              <h2 className="text-xl font-semibold">
                {t('account.title')}
                <span className="text-[#a0a0a0] text-sm font-normal ml-2">
                  {providers.length} {t('account.providers')}
                </span>
              </h2>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#2a2a2a] hover:bg-[#333] text-sm transition-colors"
            disabled={isRefetching}
          >
            <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} />
            {t('common.refresh')}
          </button>
        </div>

        {error && (
          <div className="mb-4 bg-[#1a1a1a] rounded-xl p-4 border border-[#ef4444]/30 text-sm text-[#ef4444]">
            {String(error)}
          </div>
        )}

        {providers.length === 0 ? (
          <div className="bg-[#1a1a1a] rounded-xl p-8 border border-[#2a2a2a] text-center">
            <User className="w-12 h-12 text-[#606060] mx-auto mb-3" />
            <p className="text-[#a0a0a0] mb-1">{t('account.noData')}</p>
            <p className="text-sm text-[#606060]">{t('account.noDataDesc')}</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {providers.map((provider) => (
              <ProviderCard key={provider.source} usage={provider} t={t} />
            ))}
          </div>
        )}

        {/* Info banner */}
        <div className="mt-6 bg-[#1a1a1a] rounded-xl p-4 border border-[#2a2a2a]">
          <div className="flex items-start gap-3">
            <BarChart3 className="w-5 h-5 text-[#606060] mt-0.5 shrink-0" />
            <div className="text-sm text-[#606060]">
              <p>{t('account.infoNote')}</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
