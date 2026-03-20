import { cn } from '../../lib/utils';

interface StatCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  trend?: number;
}

export function StatCard({ title, value, icon, color, trend }: StatCardProps) {
  return (
    <div className="bg-[#1a1a1a] rounded-xl p-5 border border-[#2a2a2a]">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[#a0a0a0] text-sm">{title}</span>
        <div className={cn('p-2 rounded-lg', `bg-${color}/10`)}>
          <div className={cn('w-5 h-5', `text-${color}`)}>{icon}</div>
        </div>
      </div>
      <div className="text-3xl font-semibold mb-1">{value}</div>
      {trend !== undefined && (
        <div className={cn(
          'text-sm',
          trend >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'
        )}>
          {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
        </div>
      )}
    </div>
  );
}
