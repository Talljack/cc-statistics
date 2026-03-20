import { PieChart, Pie, ResponsiveContainer, Tooltip } from 'recharts';
import type { DevTime } from '../../types/statistics';
import { formatDuration } from '../../lib/utils';

interface DevTimeChartProps {
  devTime: DevTime;
}

export function DevTimeChart({ devTime }: DevTimeChartProps) {
  const data = [
    { name: 'AI Time', value: devTime.ai_time_ms, fill: '#a855f7' },
    { name: 'User Time', value: devTime.user_time_ms || (devTime.total_ms - devTime.ai_time_ms), fill: '#2a2a2a' },
  ].filter(d => d.value > 0);

  if (data.length === 0 || devTime.total_ms === 0) {
    return (
      <div className="bg-[#1a1a1a] rounded-xl p-5 border border-[#2a2a2a]">
        <h3 className="text-lg font-semibold mb-4">Dev Time</h3>
        <div className="h-[200px] flex items-center justify-center text-[#a0a0a0]">
          No data available
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#1a1a1a] rounded-xl p-5 border border-[#2a2a2a]">
      <h3 className="text-lg font-semibold mb-4">Dev Time</h3>
      <div className="flex items-center gap-6">
        <div className="w-[160px] h-[160px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={70}
                paddingAngle={2}
                dataKey="value"
                nameKey="name"
              >
                {data.map((entry, index) => (
                  <Pie key={`cell-${index}`} dataKey="value" fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => formatDuration(value as number)}
                contentStyle={{
                  backgroundColor: '#1a1a1a',
                  border: '1px solid #2a2a2a',
                  borderRadius: '8px',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 space-y-4">
          <div className="text-center">
            <div className="text-3xl font-bold">{formatDuration(devTime.total_ms)}</div>
            <div className="text-[#a0a0a0] text-sm">Total Time</div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-xl font-semibold text-[#a855f7]">{formatDuration(devTime.ai_time_ms)}</div>
              <div className="text-[#a0a0a0] text-sm">AI Time</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-semibold">
                {formatDuration(devTime.user_time_ms || (devTime.total_ms - devTime.ai_time_ms))}
              </div>
              <div className="text-[#a0a0a0] text-sm">User Time</div>
            </div>
          </div>
          <div className="text-center">
            <div className="inline-block bg-[#a855f7]/10 px-4 py-1 rounded-full">
              <span className="text-[#a855f7] font-semibold">{devTime.ai_ratio.toFixed(1)}%</span>
              <span className="text-[#a0a0a0] text-sm ml-2">AI Ratio</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
