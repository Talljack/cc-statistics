import { useTranslation } from '../../lib/i18n';
import { cn } from '../../lib/utils';
import {
  formatSavedTimeRangeLabel,
  isSameActiveTimeRange,
  type ActiveTimeRange,
  type SavedTimeRange,
} from '../../lib/timeRanges';
import { Calendar, Settings, Check } from 'lucide-react';

interface MoreTimeRangesMenuProps {
  savedRanges: SavedTimeRange[];
  activeRange: ActiveTimeRange;
  visibleRanges: SavedTimeRange[];
  onSelectRange: (range: ActiveTimeRange) => void;
  onOpenAdHoc: () => void;
  onManageRanges: () => void;
}

export function MoreTimeRangesMenu({
  savedRanges,
  activeRange,
  visibleRanges,
  onSelectRange,
  onOpenAdHoc,
  onManageRanges,
}: MoreTimeRangesMenuProps) {
  const { t } = useTranslation();

  // Non-visible saved ranges (not pinned to header)
  const hiddenRanges = savedRanges.filter(
    (r) => !visibleRanges.some((v) => v.id === r.id)
  );

  return (
    <div className="absolute right-0 top-full mt-1 w-56 bg-[#1e1e1e] border border-[#333] rounded-lg shadow-xl shadow-black/40 py-1 z-50">
      {/* Saved custom ranges */}
      {hiddenRanges.length > 0 && (
        <>
          {hiddenRanges.map((saved) => {
            const range: ActiveTimeRange = { kind: 'custom', id: saved.id };
            const isActive = isSameActiveTimeRange(activeRange, range);
            return (
              <button
                key={saved.id}
                onClick={() => onSelectRange(range)}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-[#2a2a2a] transition-colors',
                  isActive ? 'text-[#3b82f6]' : 'text-[#d0d0d0]'
                )}
              >
                <span className="truncate">{formatSavedTimeRangeLabel(saved)}</span>
                {isActive && <Check className="w-4 h-4 shrink-0 ml-2" />}
              </button>
            );
          })}
          <div className="border-t border-[#333] my-1" />
        </>
      )}

      {/* Custom Range... (ad hoc) */}
      <button
        onClick={onOpenAdHoc}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#d0d0d0] hover:bg-[#2a2a2a] transition-colors"
      >
        <Calendar className="w-4 h-4 text-[#808080]" />
        {t('header.customRange')}
      </button>

      <div className="border-t border-[#333] my-1" />

      {/* Manage Ranges */}
      <button
        onClick={onManageRanges}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#808080] hover:bg-[#2a2a2a] hover:text-[#d0d0d0] transition-colors"
      >
        <Settings className="w-4 h-4" />
        {t('header.manageRanges')}
      </button>
    </div>
  );
}
