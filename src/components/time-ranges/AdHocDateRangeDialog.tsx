import { useState } from 'react';
import { useTranslation } from '../../lib/i18n';
import { getTodayInputValue } from '../../lib/timeRanges';
import { X } from 'lucide-react';

interface AdHocDateRangeDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (startDate: string, endDate: string) => void;
}

export function AdHocDateRangeDialog({ open, onClose, onConfirm }: AdHocDateRangeDialogProps) {
  const { t } = useTranslation();
  const today = getTodayInputValue();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);

  if (!open) return null;

  const isValid = startDate && endDate && startDate <= endDate;

  const handleConfirm = () => {
    if (isValid) {
      onConfirm(startDate, endDate);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-[#1a1a1a] border border-[#333] rounded-xl p-6 w-[360px] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">{t('header.customRange')}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-[#2a2a2a] transition-colors">
            <X className="w-4 h-4 text-[#808080]" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-[#808080] mb-1 block">{t('settings.customRanges.startDate')}</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-[#2a2a2a] border border-[#333] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#3b82f6] transition-colors [color-scheme:dark]"
            />
          </div>
          <div>
            <label className="text-xs text-[#808080] mb-1 block">{t('settings.customRanges.endDate')}</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-[#2a2a2a] border border-[#333] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#3b82f6] transition-colors [color-scheme:dark]"
            />
          </div>
        </div>

        {startDate && endDate && startDate > endDate && (
          <p className="text-xs text-red-400 mt-2">{t('settings.customRanges.dateError')}</p>
        )}

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-[#2a2a2a] text-sm text-[#a0a0a0] hover:bg-[#333] hover:text-white transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isValid}
            className="px-4 py-2 rounded-lg bg-[#3b82f6] text-sm text-white font-medium hover:bg-[#2563eb] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
