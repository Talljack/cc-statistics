import { ShortcutHelpDialog } from '../components/shortcuts/ShortcutHelpDialog';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { useFilterStore } from '../stores/filterStore';
import { useAppStore } from '../stores/appStore';
import { useSettingsStore } from '../stores/settingsStore';
import { usePricingStore } from '../stores/pricingStore';
import { useStatistics, useSessions } from '../hooks/useStatistics';
import { Header } from '../components/layout/Header';
import { Footer } from '../components/layout/Footer';
import { SettingsPage } from '../components/pages/SettingsPage';
import { StatCard } from '../components/cards/StatCard';
import { DevTimeChart } from '../components/charts/DevTimeChart';
import { TokenChart } from '../components/charts/TokenChart';
import { CodeChanges } from '../components/charts/CodeChanges';
import { ToolUsageChart } from '../components/charts/ToolUsageChart';
import { SkillUsageChart } from '../components/charts/SkillUsageChart';
import { McpUsageChart } from '../components/charts/McpUsageChart';
import { formatTokens, formatNumber, formatCost } from '../lib/utils';
import { useAlerts } from '../hooks/useAlerts';
import { useCostMetrics } from '../hooks/useCostMetrics';
import { deriveCostMetrics } from '../lib/costing';
import { MessageSquare, FileText, Clock, Cpu, DollarSign, Zap, Plug } from 'lucide-react';
import { useTranslation } from '../lib/i18n';
import type { SessionInfo, Statistics } from '../types/statistics';

export function Dashboard() {
  const { t } = useTranslation();
  const { selectedProject, activeTimeRange, selectedProvider } = useFilterStore();
  const { currentView } = useAppStore();
  const {
    autoRefreshEnabled,
    autoRefreshInterval,
    showToolUsage,
    showSkillUsage,
    showMcpUsage,
    showCost,
    showSessionsCard,
    showInstructionsCard,
    showDurationCard,
    showTokensCard,
    showCostCard,
    showSkillsCard,
    showMcpCard,
    customPricingEnabled,
    customPricing,
    customProviders,
    enabledSources,
  } = useSettingsStore();
  const dynamicPricing = usePricingStore((state) => state.models);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: stats, isLoading: statsLoading, refetch, isRefetching } = useStatistics(
    selectedProject,
    activeTimeRange,
    selectedProvider
  );
  const {
    data: sessions,
    isLoading: sessionsLoading,
    refetch: refetchSessions,
    isRefetching: isSessionsRefetching,
  } = useSessions(
    selectedProject,
    activeTimeRange,
    selectedProvider
  );
  const costMetrics = useCostMetrics(sessions);
  const dashboardTotalTokens = stats
    ? stats.tokens.input + stats.tokens.output + stats.tokens.cache_read + stats.tokens.cache_creation
    : 0;
  useAlerts(costMetrics.totalCost, dashboardTotalTokens);

  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initialLoadRef = useRef(false);

  const isRefreshing = isRefetching || isSessionsRefetching || isAnimating;
  const isLoading = statsLoading || sessionsLoading;

  useEffect(() => {
    if (stats && sessions && !initialLoadRef.current) {
      initialLoadRef.current = true;
      setLastUpdated(new Date().toISOString());
    }
  }, [sessions, stats]);

  const dynamicPricingRef = useRef(dynamicPricing);
  dynamicPricingRef.current = dynamicPricing;
  const customPricingRef = useRef(customPricing);
  customPricingRef.current = customPricing;
  const customPricingEnabledRef = useRef(customPricingEnabled);
  customPricingEnabledRef.current = customPricingEnabled;

  const syncTrayTodayStats = useCallback(async () => {
    try {
      const [todayStats, todaySessions] = await Promise.all([
        invoke<Statistics>('get_statistics', {
          project: null,
          timeFilter: 'today',
          timeRange: { kind: 'built_in', key: 'today' },
          providerFilter: null,
          customProviders: customProviders.length > 0 ? customProviders : null,
          enabledSources,
        }),
        invoke<SessionInfo[]>('get_sessions', {
          project: null,
          timeFilter: 'today',
          timeRange: { kind: 'built_in', key: 'today' },
          providerFilter: null,
          customProviders: customProviders.length > 0 ? customProviders : null,
          enabledSources,
        }),
      ]);

      const totalTokens =
        todayStats.tokens.input +
        todayStats.tokens.output +
        todayStats.tokens.cache_read +
        todayStats.tokens.cache_creation;

      const derivedTodayCost = deriveCostMetrics(todaySessions, {
        customPricingEnabled: customPricingEnabledRef.current,
        customPricing: customPricingRef.current,
        dynamicPricing: dynamicPricingRef.current.map((model) => ({
          id: model.id,
          input: model.input,
          output: model.output,
          cacheRead: model.cacheRead,
          cacheCreation: model.cacheWrite,
          billingProvider: model.billingProvider,
          upstreamProvider: model.upstreamProvider,
          aliasKeys: model.aliasKeys,
          sourceKind: model.sourceKind,
          resolvedFrom: model.resolvedFrom,
        })),
      }).totalCost;

      await invoke('update_tray_stats', {
        stats: {
          costUsd: derivedTodayCost,
          sessions: todayStats.sessions,
          instructions: todayStats.instructions,
          totalTokens,
        },
      });
    } catch {
    }
  }, [customProviders, enabledSources]);

  useEffect(() => {
    if (stats && sessions && !traySyncedRef.current) {
      traySyncedRef.current = true;
      syncTrayTodayStats();
    }
  }, [stats, sessions, syncTrayTodayStats]);

  const traySyncedRef = useRef(false);

  const handleRefresh = useCallback(async () => {
    setIsAnimating(true);
    try {
      const minDelay = new Promise(r => setTimeout(r, 800));
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['statistics'] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      await Promise.all([refetch(), refetchSessions(), minDelay]);
      setLastUpdated(new Date().toISOString());
      syncTrayTodayStats();
    } catch {
    } finally {
      setIsAnimating(false);
    }
  }, [queryClient, refetch, refetchSessions, syncTrayTodayStats]);

  const { helpOpen, setHelpOpen, shortcuts } = useKeyboardShortcuts(handleRefresh);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (autoRefreshEnabled) {
      intervalRef.current = setInterval(() => {
        handleRefresh();
      }, autoRefreshInterval * 60 * 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoRefreshEnabled, autoRefreshInterval, handleRefresh]);

  if (currentView === 'settings') {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex flex-col">
        <Header onRefresh={handleRefresh} isRefreshing={isRefreshing} />
        <SettingsPage />
        <ShortcutHelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} shortcuts={shortcuts} />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex flex-col items-center justify-center gap-6">
        <div className="relative">
          <div className="w-20 h-20 bg-gradient-to-br from-[#3b82f6] to-[#6366f1] rounded-2xl flex items-center justify-center shadow-2xl shadow-blue-500/30 animate-pulse">
            <span className="text-white font-bold text-4xl">C</span>
          </div>
          <div className="absolute -inset-4 border-2 border-[#3b82f6]/20 rounded-full animate-[spin_3s_linear_infinite]" />
          <div className="absolute -inset-4 border-2 border-transparent border-t-[#3b82f6]/60 rounded-full animate-[spin_1.5s_linear_infinite]" />
        </div>

        <div className="text-center">
          <h1 className="text-xl font-semibold mb-2">
            CC <span className="text-[#a0a0a0]">Statistics</span>
          </h1>
          <div className="flex items-center gap-2 text-sm text-[#606060]">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-[#3b82f6] rounded-full animate-[bounce_1s_ease-in-out_infinite]" />
              <span className="w-1.5 h-1.5 bg-[#3b82f6] rounded-full animate-[bounce_1s_ease-in-out_0.15s_infinite]" />
              <span className="w-1.5 h-1.5 bg-[#3b82f6] rounded-full animate-[bounce_1s_ease-in-out_0.3s_infinite]" />
            </div>
            <span>{t('dashboard.loading')}</span>
          </div>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex flex-col items-center justify-center gap-4">
        <div className="w-16 h-16 bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl flex items-center justify-center">
          <span className="text-[#606060] text-3xl font-bold">C</span>
        </div>
        <div className="text-center">
          <p className="text-[#a0a0a0] text-sm">{t('dashboard.noData')}</p>
          <p className="text-[#606060] text-xs mt-1">{t('dashboard.noDataDesc')}</p>
        </div>
      </div>
    );
  }

  const totalTokens =
    stats.tokens.input +
    stats.tokens.output +
    stats.tokens.cache_read +
    stats.tokens.cache_creation;

  const displayCost = costMetrics.totalCost;

  const cards: React.ReactNode[] = [];
  if (showSessionsCard) cards.push(<StatCard key="sessions" title={t('dashboard.sessions')} value={formatNumber(stats.sessions)} icon={<MessageSquare className="w-5 h-5" />} color="#3b82f6" onClick={() => navigate('/sessions')} />);
  if (showInstructionsCard) cards.push(<StatCard key="instructions" title={t('dashboard.instructions')} value={formatNumber(stats.instructions)} icon={<FileText className="w-5 h-5" />} color="#22c55e" onClick={() => navigate('/instructions')} />);
  if (showDurationCard) cards.push(<StatCard key="duration" title={t('dashboard.duration')} value={stats.duration_formatted} icon={<Clock className="w-5 h-5" />} color="#a855f7" />);
  if (showTokensCard) cards.push(<StatCard key="tokens" title={t('dashboard.tokens')} value={formatTokens(totalTokens)} icon={<Cpu className="w-5 h-5" />} color="#f59e0b" />);
  if (showCost && showCostCard) cards.push(<StatCard key="cost" title={t('dashboard.cost')} value={formatCost(displayCost)} icon={<DollarSign className="w-5 h-5" />} color="#ef4444" onClick={() => navigate('/cost')} />);
  const skillCount = Object.values(stats.skill_usage).reduce((s, c) => s + c, 0);
  if (showSkillsCard && skillCount > 0) cards.push(<StatCard key="skills" title={t('dashboard.skills')} value={formatNumber(skillCount)} icon={<Zap className="w-5 h-5" />} color="#22c55e" onClick={() => navigate('/skills')} />);
  const mcpCount = Object.values(stats.mcp_usage).reduce((s, c) => s + c, 0);
  if (showMcpCard && mcpCount > 0) cards.push(<StatCard key="mcp" title={t('dashboard.mcp')} value={formatNumber(mcpCount)} icon={<Plug className="w-5 h-5" />} color="#06b6d4" onClick={() => navigate('/mcp')} />);

  const gridCols = cards.length <= 4 ? 'md:grid-cols-2 2xl:grid-cols-4' : 'md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5';
  const hasToolData = showToolUsage && Object.keys(stats.tool_usage).length > 0;
  const hasMcpData = showMcpUsage && Object.keys(stats.mcp_usage).length > 0;
  const hasSkillData = showSkillUsage && Object.keys(stats.skill_usage).length > 0;
  const hasAnyUsageChart = hasToolData || hasMcpData;

  return (
    <div className="min-h-screen bg-[#0f0f0f] flex flex-col">
      <Header onRefresh={handleRefresh} isRefreshing={isRefreshing} />

      <main className="flex-1 p-6 overflow-auto">
        {cards.length > 0 && <div className={`grid grid-cols-1 gap-4 mb-6 ${gridCols}`}>{cards}</div>}
        <div className="grid grid-cols-1 gap-6 mb-6 xl:grid-cols-2">
          <DevTimeChart devTime={stats.dev_time} />
          <CodeChanges codeChanges={stats.code_changes} onClick={() => navigate('/code-changes')} />
        </div>
        <div className="mb-6">
          <TokenChart tokens={stats.tokens} costByModel={costMetrics.costByModel} />
        </div>
        {hasAnyUsageChart && (
          <div className={`grid grid-cols-1 gap-6 mb-6 ${hasToolData && hasMcpData ? 'xl:grid-cols-2' : ''}`}>
            {hasToolData && <ToolUsageChart toolUsage={stats.tool_usage} />}
            {hasMcpData && <McpUsageChart mcpUsage={stats.mcp_usage} />}
          </div>
        )}
        {hasSkillData && (
          <div className="mb-6">
            <SkillUsageChart skillUsage={stats.skill_usage} />
          </div>
        )}
      </main>

      <Footer lastUpdated={lastUpdated ?? undefined} onRefresh={handleRefresh} isRefreshing={isRefreshing} />
      <ShortcutHelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} shortcuts={shortcuts} />
    </div>
  );
}
