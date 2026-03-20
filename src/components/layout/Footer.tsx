import { RefreshCw } from 'lucide-react';

interface FooterProps {
  lastUpdated?: string;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export function Footer({ lastUpdated, onRefresh, isRefreshing }: FooterProps) {
  const formattedDate = lastUpdated
    ? new Date(lastUpdated).toLocaleString()
    : 'Never';

  return (
    <footer className="bg-[#1a1a1a] border-t border-[#2a2a2a] px-6 py-3">
      <div className="flex items-center justify-between text-sm text-[#a0a0a0]">
        <div>Last updated: {formattedDate}</div>
        <div className="flex items-center gap-4">
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>
    </footer>
  );
}
