import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useFilterStore } from '../stores/filterStore';
import { useAppStore } from '../stores/appStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useStatistics } from '../hooks/useStatistics';
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
import { MessageSquare, FileText, Clock, Cpu, DollarSign } from 'lucide-react';

export function Dashboard() {
  const { selectedProject, timeFilter } = useFilterStore();
  const { currentView } = useAppStore();
  const { autoRefreshEnabled, autoRefreshInterval, showToolUsage, showSkillUsage, showMcpUsage } = useSettingsStore();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: stats, isLoading, refetch, isRefetching } = useStatistics(
    selectedProject,
    timeFilter
  );

  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isRefreshing = isRefetching || isAnimating;

  const handleRefresh = async () => {
    setIsAnimating(true);
    try {
      const minDelay = new Promise(r => setTimeout(r, 800));
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['statistics'] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      await Promise.all([refetch(), minDelay]);
      setLastUpdated(new Date().toISOString());
    } catch {
      // ignore refresh errors
    } finally {
      setIsAnimating(false);
    }
  };

  // Auto-refresh
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
  }, [autoRefreshEnabled, autoRefreshInterval]);

  if (currentView === 'settings') {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex flex-col">
        <Header onRefresh={handleRefresh} isRefreshing={isRefreshing} />
        <SettingsPage />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
        <div className="text-[#a0a0a0]">Loading statistics...</div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
        <div className="text-[#a0a0a0]">No data available</div>
      </div>
    );
  }

  const totalTokens =
    stats.tokens.input +
    stats.tokens.output +
    stats.tokens.cache_read +
    stats.tokens.cache_creation;

  // Determine which usage charts are visible
  const hasToolData = showToolUsage && Object.keys(stats.tool_usage).length > 0;
  const hasMcpData = showMcpUsage && Object.keys(stats.mcp_usage).length > 0;
  const hasSkillData = showSkillUsage && Object.keys(stats.skill_usage).length > 0;
  const hasAnyUsageChart = hasToolData || hasMcpData;

  return (
    <div className="min-h-screen bg-[#0f0f0f] flex flex-col">
      <Header onRefresh={handleRefresh} isRefreshing={isRefreshing} />

      <main className="flex-1 p-6 overflow-auto">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 gap-4 mb-6 md:grid-cols-2 2xl:grid-cols-5">
          <StatCard
            title="Sessions"
            value={formatNumber(stats.sessions)}
            icon={<MessageSquare className="w-5 h-5" />}
            color="#3b82f6"
            onClick={() => navigate('/sessions')}
          />
          <StatCard
            title="Instructions"
            value={formatNumber(stats.instructions)}
            icon={<FileText className="w-5 h-5" />}
            color="#22c55e"
            onClick={() => navigate('/instructions')}
          />
          <StatCard
            title="Duration"
            value={stats.duration_formatted}
            icon={<Clock className="w-5 h-5" />}
            color="#a855f7"
          />
          <StatCard
            title="Tokens"
            value={formatTokens(totalTokens)}
            icon={<Cpu className="w-5 h-5" />}
            color="#f59e0b"
          />
          <StatCard
            title="Cost"
            value={formatCost(stats.cost_usd)}
            icon={<DollarSign className="w-5 h-5" />}
            color="#ef4444"
          />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 gap-6 mb-6 xl:grid-cols-2">
          <DevTimeChart devTime={stats.dev_time} />
          <CodeChanges codeChanges={stats.code_changes} />
        </div>

        {/* Token Chart */}
        <div className="mb-6">
          <TokenChart tokens={stats.tokens} />
        </div>

        {/* Tool/MCP Usage Charts (conditional) */}
        {hasAnyUsageChart && (
          <div className={`grid grid-cols-1 gap-6 mb-6 ${hasToolData && hasMcpData ? 'xl:grid-cols-2' : ''}`}>
            {hasToolData && <ToolUsageChart toolUsage={stats.tool_usage} />}
            {hasMcpData && <McpUsageChart mcpUsage={stats.mcp_usage} />}
          </div>
        )}

        {/* Skill Usage Chart (conditional) */}
        {hasSkillData && (
          <div className="mb-6">
            <SkillUsageChart skillUsage={stats.skill_usage} />
          </div>
        )}
      </main>

      <Footer
        lastUpdated={lastUpdated ?? undefined}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      />
    </div>
  );
}
