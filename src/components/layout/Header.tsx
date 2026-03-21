import { useMemo } from 'react';
import { useFilterStore } from '../../stores/filterStore';
import { useAppStore } from '../../stores/appStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useProjects, useAvailableProviders } from '../../hooks/useStatistics';
import { cn } from '../../lib/utils';
import type { TimeFilter } from '../../types/statistics';
import { ArrowLeft, ChevronDown, RefreshCw, Settings } from 'lucide-react';

const builtInTimeFilters: { label: string; value: TimeFilter }[] = [
  { label: 'Today', value: 'today' },
  { label: 'Week', value: 'week' },
  { label: 'Month', value: 'month' },
];

interface HeaderProps {
  onRefresh: () => void;
  isRefreshing: boolean;
}

export function Header({ onRefresh, isRefreshing }: HeaderProps) {
  const { selectedProject, timeFilter, selectedProvider, setProject, setTimeFilter, setProvider } = useFilterStore();
  const { data: projects } = useProjects();
  const { data: availableProviders } = useAvailableProviders();
  const { currentView, setView } = useAppStore();
  const { language, customTimeFilters } = useSettingsStore();

  const timeFilters = useMemo(() => {
    const custom = customTimeFilters.map((f: { label: string; days: number }) => ({
      label: f.label,
      value: `days_${f.days}` as TimeFilter,
    }));
    return [...builtInTimeFilters, ...custom, { label: 'All', value: 'all' as TimeFilter }];
  }, [customTimeFilters]);

  const settingsTitle = language === 'en' ? 'Settings' : language === 'ja' ? '設定' : '设置';

  if (currentView === 'settings') {
    return (
      <header className="bg-[#1a1a1a] border-b border-[#2a2a2a] px-6 py-4 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setView('dashboard')}
            className="p-2 rounded-lg hover:bg-[#2a2a2a] transition-colors"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-5 h-5 text-[#a0a0a0] hover:text-white transition-colors" />
          </button>
          <h1 className="text-lg font-semibold">{settingsTitle}</h1>
        </div>
      </header>
    );
  }

  return (
    <header className="bg-[#1a1a1a] border-b border-[#2a2a2a] px-6 py-4 sticky top-0 z-50">
      <div className="flex flex-wrap items-center gap-4 xl:flex-nowrap xl:justify-between">
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-8 h-8 bg-gradient-to-br from-[#3b82f6] to-[#6366f1] rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
            <span className="text-white font-bold text-lg">C</span>
          </div>
          <h1 className="text-lg font-semibold whitespace-nowrap">
            CC <span className="text-[#a0a0a0]">Statistics</span>
          </h1>
        </div>

        <div className="flex flex-1 min-w-0 flex-wrap items-center justify-end gap-3">
          {/* Project Selector */}
          <div className="relative flex-1 min-w-[180px] max-w-[400px]">
            <select
              value={selectedProject || ''}
              onChange={(e) => setProject(e.target.value || null)}
              className="w-full appearance-none bg-[#2a2a2a] border border-[#333] rounded-lg px-4 py-2 pr-10 text-sm focus:outline-none focus:border-[#3b82f6] cursor-pointer hover:border-[#444] transition-colors"
            >
              <option value="">All Projects</option>
              {projects?.map((project) => (
                <option key={project.name} value={project.name}>
                  {project.name}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-[#a0a0a0]" />
          </div>

          {/* Provider Selector */}
          <div className="relative min-w-[140px] max-w-[220px]">
            <select
              value={selectedProvider || ''}
              onChange={(e) => setProvider(e.target.value || null)}
              className="w-full appearance-none bg-[#2a2a2a] border border-[#333] rounded-lg px-4 py-2 pr-10 text-sm focus:outline-none focus:border-[#3b82f6] cursor-pointer hover:border-[#444] transition-colors"
            >
              <option value="">All Providers</option>
              {availableProviders?.map((provider) => (
                <option key={provider} value={provider}>
                  {provider}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-[#a0a0a0]" />
          </div>

          {/* Time Filter Tabs */}
          <div className="flex shrink-0 bg-[#2a2a2a] rounded-lg p-1 overflow-x-auto">
            {timeFilters.map((filter) => (
              <button
                key={filter.value}
                onClick={() => setTimeFilter(filter.value)}
                className={cn(
                  'px-4 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap',
                  timeFilter === filter.value
                    ? 'bg-[#3b82f6] text-white shadow-md shadow-blue-500/20'
                    : 'text-[#a0a0a0] hover:text-white'
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {/* Refresh Button */}
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-lg hover:bg-[#2a2a2a] transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={cn('w-5 h-5 text-[#a0a0a0] hover:text-white transition-colors', isRefreshing && 'animate-refresh-spin text-[#3b82f6]')} />
          </button>

          {/* Settings Button */}
          <button
            onClick={() => setView('settings')}
            className="p-2 rounded-lg hover:bg-[#2a2a2a] transition-colors"
            title="Settings"
          >
            <Settings className="w-5 h-5 text-[#a0a0a0] hover:text-white transition-colors" />
          </button>
        </div>
      </div>
    </header>
  );
}
