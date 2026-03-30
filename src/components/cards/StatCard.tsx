interface StatCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  trend?: number;
  onClick?: () => void;
}

export function StatCard({ title, value, icon, color, trend, onClick }: StatCardProps) {
  return (
    <div
      className={`bg-[var(--color-bg-surface)] rounded-xl p-5 border border-[var(--color-border-base)] relative overflow-hidden group hover:border-[var(--color-border-strong)] transition-colors${onClick ? ' cursor-pointer' : ''}`}
      onClick={onClick}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
        style={{ backgroundColor: color }}
      />
      <div className="flex items-center justify-between mb-3">
        <span className="text-[var(--color-text-secondary)] text-sm font-medium">{title}</span>
        <div
          className="p-2 rounded-lg"
          style={{ backgroundColor: `${color}15` }}
        >
          <div className="w-5 h-5" style={{ color }}>
            {icon}
          </div>
        </div>
      </div>
      <div className="text-3xl font-bold" style={{ color }}>
        {value}
      </div>
      {trend !== undefined && (
        <div
          className="text-sm mt-1 font-medium"
          style={{ color: trend >= 0 ? 'var(--color-accent-green)' : 'var(--color-accent-red)' }}
        >
          {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
        </div>
      )}
    </div>
  );
}
