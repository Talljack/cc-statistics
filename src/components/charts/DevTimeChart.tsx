import type { DevTime } from '../../types/statistics';
import { formatDuration } from '../../lib/utils';
import { Zap } from 'lucide-react';

interface DevTimeChartProps {
  devTime: DevTime;
}

export function DevTimeChart({ devTime }: DevTimeChartProps) {
  if (devTime.total_ms === 0) {
    return (
      <div className="bg-[#1a1a1a] rounded-xl p-5 border border-[#2a2a2a]">
        <h3 className="text-lg font-semibold mb-4">AI Processing Time</h3>
        <div className="h-[200px] flex items-center justify-center text-[#a0a0a0]">
          No data available
        </div>
      </div>
    );
  }

  const totalSeconds = Math.floor(devTime.total_ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return (
    <div className="bg-[#1a1a1a] rounded-xl p-5 border border-[#2a2a2a]">
      <h3 className="text-lg font-semibold mb-5">AI Processing Time</h3>

      <div className="flex items-center gap-6">
        {/* Big number display */}
        <div className="flex items-center justify-center w-[160px] h-[160px] shrink-0 rounded-full border-4 border-[#a855f7]/30 bg-[#a855f7]/5">
          <div className="text-center">
            <div className="text-3xl font-bold text-[#a855f7]">{formatDuration(devTime.total_ms)}</div>
            <div className="text-xs text-[#a0a0a0] mt-1">Total</div>
          </div>
        </div>

        {/* Breakdown */}
        <div className="flex-1 space-y-3">
          {hours > 0 && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-[#a855f7]/5 border border-[#a855f7]/10">
              <span className="text-sm text-[#a0a0a0]">Hours</span>
              <span className="text-2xl font-bold text-[#a855f7]">{hours}</span>
            </div>
          )}
          <div className="flex items-center justify-between p-3 rounded-lg bg-[#a855f7]/5 border border-[#a855f7]/10">
            <span className="text-sm text-[#a0a0a0]">Minutes</span>
            <span className="text-2xl font-bold text-[#a855f7]">{hours > 0 ? minutes : Math.floor(totalSeconds / 60)}</span>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg bg-[#a855f7]/5 border border-[#a855f7]/10">
            <span className="text-sm text-[#a0a0a0]">Seconds</span>
            <span className="text-2xl font-bold text-[#a855f7]">{seconds}</span>
          </div>

          <div className="flex items-center gap-2 text-xs text-[#666] pt-1">
            <Zap className="w-3 h-3" />
            <span>Time spent by AI generating responses</span>
          </div>
        </div>
      </div>
    </div>
  );
}
