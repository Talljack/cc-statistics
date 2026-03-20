import { useFilterStore } from '../../stores/filterStore';
import { useProjects } from '../../hooks/useStatistics';
import { cn } from '../../lib/utils';
import type { TimeFilter } from '../../types/statistics';
import { ChevronDown, RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

const timeFilters: { label: string; value: TimeFilter }[] = [
  { label: 'Today', value: 'today' },
  { label: 'Week', value: 'week' },
  { label: 'Month', value: 'month' },
  { label: 'All', value: 'all' },
];

export function Header() {
  const { selectedProject, timeFilter, setProject, setTimeFilter } = useFilterStore();
  const { data: projects } = useProjects();
  const queryClient = useQueryClient();

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['statistics'] });
    queryClient.invalidateQueries({ queryKey: ['projects'] });
  };

  return (
    <header className="bg-[#1a1a1a] border-b border-[#2a2a2a] px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#3b82f6] rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-lg">C</span>
          </div>
          <h1 className="text-xl font-semibold">CC Statistics</h1>
        </div>

        <div className="flex items-center gap-4">
          {/* Project Selector */}
          <div className="relative">
            <select
              value={selectedProject || ''}
              onChange={(e) => setProject(e.target.value || null)}
              className="appearance-none bg-[#2a2a2a] border border-[#2a2a2a] rounded-lg px-4 py-2 pr-10 text-sm focus:outline-none focus:border-[#3b82f6] cursor-pointer"
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

          {/* Time Filter Tabs */}
          <div className="flex bg-[#2a2a2a] rounded-lg p-1">
            {timeFilters.map((filter) => (
              <button
                key={filter.value}
                onClick={() => setTimeFilter(filter.value)}
                className={cn(
                  'px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
                  timeFilter === filter.value
                    ? 'bg-[#3b82f6] text-white'
                    : 'text-[#a0a0a0] hover:text-white'
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {/* Refresh Button */}
          <button
            onClick={handleRefresh}
            className="p-2 rounded-lg hover:bg-[#2a2a2a] transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-5 h-5 text-[#a0a0a0]" />
          </button>
        </div>
      </div>
    </header>
  );
}
