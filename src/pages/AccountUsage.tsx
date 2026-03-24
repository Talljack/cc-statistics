import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAccountUsage } from '../hooks/useStatistics';
import { Header } from '../components/layout/Header';
import { useTranslation } from '../lib/i18n';
import { formatTokens, formatCost } from '../lib/utils';
import { ArrowLeft, User, RefreshCw, Clock, BarChart3, ChevronDown } from 'lucide-react';
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

// Plan definitions per source with estimated request quotas
// Note: actual quotas are token-based and dynamic; these are approximate request equivalents
interface PlanDef {
  key: string;
  label: string;
  session: number;
  weekly: number;
}

const CLAUDE_PLANS: PlanDef[] = [
  { key: 'pro', label: 'Pro ($20)', session: 45, weekly: 900 },
  { key: 'max_5x', label: 'Max 5x ($100)', session: 225, weekly: 4500 },
  { key: 'max_20x', label: 'Max 20x ($200)', session: 900, weekly: 18000 },
  { key: 'team', label: 'Team', session: 225, weekly: 4500 },
  { key: 'enterprise', label: 'Enterprise', session: 450, weekly: 9000 },
  { key: 'api_key', label: 'API Key', session: 9999, weekly: 99999 },
];

const CODEX_PLANS: PlanDef[] = [
  { key: 'free', label: 'Free', session: 10, weekly: 50 },
  { key: 'plus', label: 'Plus ($20)', session: 30, weekly: 500 },
  { key: 'pro', label: 'Pro ($200)', session: 150, weekly: 3000 },
  { key: 'team', label: 'Team ($25/user)', session: 100, weekly: 2000 },
  { key: 'business', label: 'Business', session: 150, weekly: 3000 },
  { key: 'enterprise', label: 'Enterprise', session: 300, weekly: 6000 },
];

const GEMINI_PLANS: PlanDef[] = [
  { key: 'free', label: 'Free', session: 25, weekly: 300 },
  { key: 'pro', label: 'Pro', session: 100, weekly: 2000 },
  { key: 'enterprise', label: 'Enterprise', session: 500, weekly: 10000 },
];

const PLANS_BY_SOURCE: Record<string, PlanDef[]> = {
  claude_code: CLAUDE_PLANS,
  codex: CODEX_PLANS,
  gemini: GEMINI_PLANS,
};

// Map detected plan string to plan index
function findPlanIndex(plans: PlanDef[], detectedPlan: string): number {
  // Direct key match
  const idx = plans.findIndex(p => p.key === detectedPlan);
  if (idx >= 0) return idx;

  // Fuzzy match for common plan type names
  const lower = detectedPlan.toLowerCase();
  if (lower.includes('enterprise') || lower.includes('edu')) {
    const i = plans.findIndex(p => p.key === 'enterprise');
    if (i >= 0) return i;
  }
  if (lower.includes('business')) {
    const i = plans.findIndex(p => p.key === 'business' || p.key === 'enterprise');
    if (i >= 0) return i;
  }
  if (lower.includes('team')) {
    const i = plans.findIndex(p => p.key === 'team');
    if (i >= 0) return i;
  }
  if (lower.includes('max_20') || lower.includes('max20')) {
    const i = plans.findIndex(p => p.key === 'max_20x');
    if (i >= 0) return i;
  }
  if (lower.includes('max')) {
    const i = plans.findIndex(p => p.key === 'max_5x');
    if (i >= 0) return i;
  }
  if (lower.includes('plus')) {
    const i = plans.findIndex(p => p.key === 'plus');
    if (i >= 0) return i;
  }
  if (lower.includes('pro')) {
    const i = plans.findIndex(p => p.key === 'pro');
    if (i >= 0) return i;
  }
  if (lower === 'api_key' || lower === 'apikey') {
    const i = plans.findIndex(p => p.key === 'api_key');
    if (i >= 0) return i;
  }
  return 0; // default to first plan
}

function getStatusColor(percentage: number): string {
  if (percentage >= 85) return '#ef4444';
  if (percentage >= 60) return '#f59e0b';
  return '#22c55e';
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '--';
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    const remainHours = hours % 24;
    return `${days}d ${remainHours}h`;
  }
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function UsageProgressBar({ label, current, max, resetMs }: {
  label: string;
  current: number;
  max: number;
  resetMs: number;
}) {
  const percentage = max > 0 ? Math.min((current / max) * 100, 100) : 0;
  const statusColor = getStatusColor(percentage);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-[#a0a0a0]">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono" style={{ color: statusColor }}>
            {current} / {max}
          </span>
          <span className="text-xs text-[#606060]">({percentage.toFixed(0)}%)</span>
        </div>
      </div>
      <div className="h-3 bg-[#2a2a2a] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${percentage}%`,
            backgroundColor: statusColor,
            opacity: 0.85,
          }}
        />
      </div>
      <div className="flex items-center gap-1 text-xs text-[#606060]">
        <Clock className="w-3 h-3" />
        <span>Reset in {formatCountdown(resetMs)}</span>
      </div>
    </div>
  );
}

function ProviderCard({ usage, t }: { usage: ProviderUsage; t: (key: string) => string }) {
  const source = usage.source;
  const label = SOURCE_LABELS[source] || source;
  const plans = PLANS_BY_SOURCE[source] || CLAUDE_PLANS;

  // Auto-detect initial plan from backend
  const detectedIdx = findPlanIndex(plans, usage.detectedPlan);
  const [selectedPlanIdx, setSelectedPlanIdx] = useState(detectedIdx);
  const [showPlanSelector, setShowPlanSelector] = useState(false);
  const plan = plans[selectedPlanIdx];

  const sessionPct = plan.session > 0 ? (usage.sessionRequests / plan.session) * 100 : 0;
  const weeklyPct = plan.weekly > 0 ? (usage.weeklyRequests / plan.weekly) * 100 : 0;
  const overallStatus = Math.max(sessionPct, weeklyPct);
  const statusColor = getStatusColor(overallStatus);

  // Show detected plan badge
  const isAutoDetected = usage.detectedPlan !== 'unknown';

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
            title={overallStatus >= 85 ? t('account.nearLimit') : overallStatus >= 60 ? t('account.moderate') : t('account.healthy')}
          />
        </div>
        <div className="relative">
          <button
            onClick={() => setShowPlanSelector(!showPlanSelector)}
            className="flex items-center gap-1 px-3 py-1 rounded-lg bg-[#2a2a2a] hover:bg-[#333] text-sm transition-colors"
          >
            {plan.label}
            {isAutoDetected && selectedPlanIdx === detectedIdx && (
              <span className="text-[10px] text-[#22c55e] ml-1">{t('account.autoDetected')}</span>
            )}
            <ChevronDown className="w-3 h-3" />
          </button>
          {showPlanSelector && (
            <div className="absolute right-0 top-full mt-1 bg-[#2a2a2a] border border-[#3a3a3a] rounded-lg shadow-xl z-10 min-w-[180px]">
              {plans.map((p, idx) => (
                <button
                  key={p.key}
                  onClick={() => { setSelectedPlanIdx(idx); setShowPlanSelector(false); }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-[#333] transition-colors first:rounded-t-lg last:rounded-b-lg ${idx === selectedPlanIdx ? 'text-white' : 'text-[#a0a0a0]'}`}
                >
                  <span>{p.label}</span>
                  {idx === detectedIdx && isAutoDetected && (
                    <span className="text-[10px] text-[#22c55e] ml-1">{t('account.autoDetected')}</span>
                  )}
                  <span className="text-[#606060] ml-2 text-xs">{p.session}/{p.weekly}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Usage meters */}
      <div className="p-5 space-y-5">
        <UsageProgressBar
          label={t('account.sessionWindow')}
          current={usage.sessionRequests}
          max={plan.session}
          resetMs={usage.sessionResetMs}
        />
        <UsageProgressBar
          label={t('account.weeklyWindow')}
          current={usage.weeklyRequests}
          max={plan.weekly}
          resetMs={usage.weeklyResetMs}
        />

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 pt-2 border-t border-[#2a2a2a]">
          <div className="text-center">
            <div className="text-xs text-[#606060] mb-1">{t('account.tokens5h')}</div>
            <div className="text-sm font-mono">{formatTokens(usage.sessionTokens)}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-[#606060] mb-1">{t('account.tokens7d')}</div>
            <div className="text-sm font-mono">{formatTokens(usage.weeklyTokens)}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-[#606060] mb-1">{t('account.cost7d')}</div>
            <div className="text-sm font-mono">{formatCost(usage.weeklyCostUsd)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AccountUsage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading, isRefetching } = useAccountUsage();

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
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
        <div className="text-[#a0a0a0]">{t('account.loading')}</div>
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
