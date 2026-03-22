import { useState, useRef, useEffect } from 'react';
import { useFilterStore } from '../../stores/filterStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useAppStore } from '../../stores/appStore';
import { useTranslation } from '../../lib/i18n';
import { cn } from '../../lib/utils';
import {
  getVisibleHeaderRanges,
  isSameActiveTimeRange,
  formatSavedTimeRangeLabel,
  formatActiveTimeRangeLabel,
  type ActiveTimeRange,
  type BuiltInTimeRangeKey,
} from '../../lib/timeRanges';
import { MoreTimeRangesMenu } from './MoreTimeRangesMenu';
import { AdHocDateRangeDialog } from './AdHocDateRangeDialog';
import { ChevronDown } from 'lucide-react';

const builtInKeys: { labelKey: string; key: BuiltInTimeRangeKey }[] = [
  { labelKey: 'header.today', key: 'today' },
  { labelKey: 'header.week', key: 'week' },
  { labelKey: 'header.month', key: 'month' },
  { labelKey: 'header.all', key: 'all' },
];

export function HeaderTimeRangeControl() {
  const { t } = useTranslation();
  const { activeTimeRange, setActiveTimeRange } = useFilterStore();
  const savedRanges = useSettingsStore((s) => s.savedTimeRanges);
  const { setView } = useAppStore();

  const [menuOpen, setMenuOpen] = useState(false);
  const [adHocOpen, setAdHocOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  const visibleCustom = getVisibleHeaderRanges(savedRanges);

  // Check if the active range is a hidden custom range (shown under "More")
  const isActiveInMore =
    (activeTimeRange.kind === 'custom' && !visibleCustom.some((r) => r.id === activeTimeRange.id)) ||
    activeTimeRange.kind === 'ad_hoc';

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const handleSelectRange = (range: ActiveTimeRange) => {
    setActiveTimeRange(range);
    setMenuOpen(false);
  };

  const moreLabel = isActiveInMore
    ? `${t('header.more')}: ${formatActiveTimeRangeLabel(activeTimeRange, savedRanges)}`
    : t('header.more');

  return (
    <div className="flex shrink-0 items-center bg-[#2a2a2a] rounded-lg p-1 gap-0.5">
      {/* Built-in range buttons */}
      {builtInKeys.map((item) => {
        const range: ActiveTimeRange = { kind: 'built_in', key: item.key };
        const isActive = isSameActiveTimeRange(activeTimeRange, range);
        return (
          <button
            key={item.key}
            onClick={() => handleSelectRange(range)}
            className={cn(
              'px-4 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap',
              isActive
                ? 'bg-[#3b82f6] text-white shadow-md shadow-blue-500/20'
                : 'text-[#a0a0a0] hover:text-white'
            )}
          >
            {t(item.labelKey)}
          </button>
        );
      })}

      {/* Visible custom range shortcuts */}
      {visibleCustom.map((saved) => {
        const range: ActiveTimeRange = { kind: 'custom', id: saved.id };
        const isActive = isSameActiveTimeRange(activeTimeRange, range);
        return (
          <button
            key={saved.id}
            onClick={() => handleSelectRange(range)}
            className={cn(
              'px-3 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap',
              isActive
                ? 'bg-[#3b82f6] text-white shadow-md shadow-blue-500/20'
                : 'text-[#808080] hover:text-white'
            )}
          >
            {formatSavedTimeRangeLabel(saved)}
          </button>
        );
      })}

      {/* More button */}
      <div className="relative" ref={moreRef}>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className={cn(
            'flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap',
            isActiveInMore
              ? 'bg-[#3b82f6] text-white shadow-md shadow-blue-500/20'
              : 'text-[#808080] hover:text-white'
          )}
        >
          <span className="max-w-[140px] truncate">{moreLabel}</span>
          <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', menuOpen && 'rotate-180')} />
        </button>

        {menuOpen && (
          <MoreTimeRangesMenu
            savedRanges={savedRanges}
            activeRange={activeTimeRange}
            visibleRanges={visibleCustom}
            onSelectRange={handleSelectRange}
            onOpenAdHoc={() => {
              setMenuOpen(false);
              setAdHocOpen(true);
            }}
            onManageRanges={() => {
              setMenuOpen(false);
              setView('settings');
            }}
          />
        )}
      </div>

      {/* Ad-hoc date range dialog */}
      <AdHocDateRangeDialog
        open={adHocOpen}
        onClose={() => setAdHocOpen(false)}
        onConfirm={(startDate, endDate) => {
          handleSelectRange({ kind: 'ad_hoc', startDate, endDate });
          setAdHocOpen(false);
        }}
      />
    </div>
  );
}
