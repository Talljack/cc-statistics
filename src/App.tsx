import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFilterStore } from './stores/filterStore';
import { useStatistics } from './hooks/useStatistics';
import { Header } from './components/layout/Header';
import { Footer } from './components/layout/Footer';
import { StatCard } from './components/cards/StatCard';
import { DevTimeChart } from './components/charts/DevTimeChart';
import { TokenChart } from './components/charts/TokenChart';
import { CodeChanges } from './components/charts/CodeChanges';
import { formatTokens, formatNumber } from './lib/utils';
import { MessageSquare, FileText, Clock, Cpu } from 'lucide-react';

const queryClient = new QueryClient();

function Dashboard() {
  const { selectedProject, timeFilter } = useFilterStore();
  const { data: stats, isLoading, refetch, isRefetching } = useStatistics(
    selectedProject,
    timeFilter
  );

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

  return (
    <div className="min-h-screen bg-[#0f0f0f] flex flex-col">
      <Header />

      <main className="flex-1 p-6 overflow-auto">
        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <StatCard
            title="Sessions"
            value={formatNumber(stats.sessions)}
            icon={<MessageSquare className="w-5 h-5" />}
            color="#3b82f6"
          />
          <StatCard
            title="Instructions"
            value={formatNumber(stats.instructions)}
            icon={<FileText className="w-5 h-5" />}
            color="#22c55e"
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
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          <DevTimeChart devTime={stats.dev_time} />
          <CodeChanges codeChanges={stats.code_changes} />
        </div>

        {/* Token Chart */}
        <TokenChart tokens={stats.tokens} />
      </main>

      <Footer
        onRefresh={() => refetch()}
        isRefreshing={isRefetching}
      />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Dashboard />
    </QueryClientProvider>
  );
}

export default App;
