import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Routes, Route } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';
import { Sessions } from './pages/Sessions';
import { Instructions } from './pages/Instructions';
import { CostBreakdown } from './pages/CostBreakdown';
import { usePricingStore } from './stores/pricingStore';

const queryClient = new QueryClient();

function PricingLoader() {
  const fetchPricing = usePricingStore((s) => s.fetchPricing);
  useEffect(() => {
    fetchPricing();
  }, [fetchPricing]);
  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <PricingLoader />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/sessions" element={<Sessions />} />
        <Route path="/instructions" element={<Instructions />} />
        <Route path="/cost" element={<CostBreakdown />} />
      </Routes>
    </QueryClientProvider>
  );
}

export default App;
