import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';
import { Sessions } from './pages/Sessions';
import { Instructions } from './pages/Instructions';
import { CostBreakdown } from './pages/CostBreakdown';
import { Skills } from './pages/Skills';
import { McpServers } from './pages/McpServers';
import { Report } from './pages/Report';
import { CodeChangesDetail } from './pages/CodeChangesDetail';
import { AccountUsage } from './pages/AccountUsage';
import { SessionDetail } from './pages/SessionDetail';
import { UpdateDialog } from './components/UpdateDialog';
import { useTheme } from './hooks/useTheme';
import { usePricingStore } from './stores/pricingStore';
import { useUpdateStore } from './stores/updateStore';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
    },
  },
});

function PricingLoader() {
  const fetchPricing = usePricingStore((s) => s.fetchPricing);
  useEffect(() => {
    fetchPricing();
  }, [fetchPricing]);
  return null;
}

function UpdateChecker() {
  const checkForUpdate = useUpdateStore((s) => s.checkForUpdate);
  useEffect(() => {
    const timer = setTimeout(() => {
      checkForUpdate();
    }, 3000);
    return () => clearTimeout(timer);
  }, [checkForUpdate]);
  return null;
}

function App() {
  useTheme();

  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <PricingLoader />
        <UpdateChecker />
        <UpdateDialog />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/sessions" element={<Sessions />} />
          <Route path="/session/:id" element={<SessionDetail />} />
          <Route path="/instructions" element={<Instructions />} />
          <Route path="/cost" element={<CostBreakdown />} />
          <Route path="/skills" element={<Skills />} />
          <Route path="/mcp" element={<McpServers />} />
          <Route path="/report" element={<Report />} />
          <Route path="/code-changes" element={<CodeChangesDetail />} />
          <Route path="/account" element={<AccountUsage />} />
        </Routes>
      </HashRouter>
    </QueryClientProvider>
  );
}

export default App;
