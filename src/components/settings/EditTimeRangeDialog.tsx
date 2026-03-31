import { useState, useEffect } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { useTranslation } from '../../lib/i18n';
import { cn } from '../../lib/utils';
import {
  buildSavedTimeRangeFromDraft,
  getNextSortOrder,
  getTodayInputValue,
  type SavedTimeRange,
  type TimeRangeDraft,
} from '../../lib/timeRanges';
import { X } from 'lucide-react';

interface EditTimeRangeDialogProps {
  open: boolean;
  onClose: () => void;
  editingRange?: SavedTimeRange;
}

function createInitialDraft(editingRange?: SavedTimeRange): TimeRangeDraft {
  if (editingRange) {
    if (editingRange.kind === 'relative') {
      return {
        id: editingRange.id,
        label: editingRange.label,
        kind: 'relative',
        days: editingRange.days,
        includeToday: editingRange.includeToday,
        showInHeader: editingRange.showInHeader,
      };
    }
    return {
      id: editingRange.id,
      label: editingRange.label,
      kind: 'absolute',
      startDate: editingRange.startDate,
      endDate: editingRange.endDate,
      showInHeader: editingRange.showInHeader,
    };
  }
  return {
    label: '',
    kind: 'relative',
    days: 7,
    includeToday: true,
    showInHeader: true,
  };
}

export function EditTimeRangeDialog({ open, onClose, editingRange }: EditTimeRangeDialogProps) {
  const { t } = useTranslation();
  const { savedTimeRanges, addSavedTimeRange, updateSavedTimeRange } = useSettingsStore();
  const [draft, setDraft] = useState<TimeRangeDraft>(() => createInitialDraft(editingRange));
  const [error, setError] = useState('');

  const isEditMode = !!editingRange;

  useEffect(() => {
    if (open) {
      setDraft(createInitialDraft(editingRange));
      setError('');
    }
  }, [open, editingRange]);

  if (!open) return null;

  const handleKindChange = (kind: 'relative' | 'absolute') => {
    if (kind === draft.kind) return;
    const today = getTodayInputValue();
    if (kind === 'relative') {
      setDraft({
        id: draft.id,
        label: draft.label,
        kind: 'relative',
        days: 7,
        includeToday: true,
        showInHeader: draft.showInHeader,
      });
    } else {
      setDraft({
        id: draft.id,
        label: draft.label,
        kind: 'absolute',
        startDate: today,
        endDate: today,
        showInHeader: draft.showInHeader,
      });
    }
    setError('');
  };

  const validate = (): boolean => {
    if (draft.kind === 'relative') {
      if (!draft.days || draft.days < 1 || draft.days > 3650) {
        setError(t('settings.customRanges.daysError') || 'Days must be between 1 and 3650');
        return false;
      }
    } else {
      if (!draft.startDate || !draft.endDate) {
        setError(t('settings.customRanges.dateRequired') || 'Start and end dates are required');
        return false;
      }
      if (draft.startDate > draft.endDate) {
        setError(t('settings.customRanges.dateError') || 'Start date must be before end date');
        return false;
      }
    }
    setError('');
    return true;
  };

  const handleSave = () => {
    if (!validate()) return;

    const sortOrder = isEditMode
      ? (editingRange!.sortOrder)
      : getNextSortOrder(savedTimeRanges);
    const saved = buildSavedTimeRangeFromDraft(draft, sortOrder);

    if (isEditMode) {
      updateSavedTimeRange(editingRange!.id, saved);
    } else {
      addSavedTimeRange(saved);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-[var(--color-bg-surface)] border border-[var(--color-border-base)] rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border-base)]">
          <h3 className="text-base font-semibold">
            {isEditMode ? t('settings.customRanges.edit') : t('settings.customRanges.add')}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--color-bg-hover)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Range Type Selector */}
          <div>
            <label className="text-xs text-[var(--color-text-tertiary)] mb-1.5 block">
              {t('settings.customRanges.type') || 'Type'}
            </label>
            <div className="flex bg-[var(--color-bg-hover)] border border-[var(--color-border-base)] rounded-lg p-1">
              <button
                onClick={() => !isEditMode && handleKindChange('relative')}
                disabled={isEditMode}
                className={cn(
                  'flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
                  draft.kind === 'relative'
                    ? 'bg-[#3b82f6] text-white shadow-md shadow-blue-500/20'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
                  isEditMode && 'cursor-not-allowed opacity-60'
                )}
              >
                {t('settings.customRanges.relative')}
              </button>
              <button
                onClick={() => !isEditMode && handleKindChange('absolute')}
                disabled={isEditMode}
                className={cn(
                  'flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
                  draft.kind === 'absolute'
                    ? 'bg-[#3b82f6] text-white shadow-md shadow-blue-500/20'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
                  isEditMode && 'cursor-not-allowed opacity-60'
                )}
              >
                {t('settings.customRanges.absolute')}
              </button>
            </div>
          </div>

          {/* Label Input */}
          <div>
            <label className="text-xs text-[var(--color-text-tertiary)] mb-1.5 block">
              {t('settings.customRanges.label')}
            </label>
            <input
              type="text"
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              placeholder={
                draft.kind === 'relative'
                  ? `Last ${draft.kind === 'relative' ? draft.days : ''} Days`
                  : 'e.g., Q1 2026'
              }
              className="w-full bg-[var(--color-bg-hover)] border border-[var(--color-border-base)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[#3b82f6] placeholder-[var(--color-text-faint)] transition-colors"
            />
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              {t('settings.customRanges.labelHint') || 'Leave empty to auto-generate'}
            </p>
          </div>

          {/* Relative Fields */}
          {draft.kind === 'relative' && (
            <>
              <div>
                <label className="text-xs text-[var(--color-text-tertiary)] mb-1.5 block">
                  {t('settings.customRanges.days')}
                </label>
                <input
                  type="number"
                  min={1}
                  max={3650}
                  value={draft.days}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val)) {
                      setDraft({ ...draft, days: val });
                    }
                  }}
                  className="w-full bg-[var(--color-bg-hover)] border border-[var(--color-border-base)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[#3b82f6] transition-colors font-mono"
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{t('settings.customRanges.includeToday')}</div>
                  <div className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                    {t('settings.customRanges.includeTodayDesc') || 'Include current day in the range'}
                  </div>
                </div>
                <button
                  role="switch"
                  aria-checked={draft.includeToday}
                  onClick={() => setDraft({ ...draft, includeToday: !draft.includeToday })}
                  className={cn(
                    'relative w-12 h-7 rounded-full transition-colors shrink-0',
                    draft.includeToday ? 'bg-[#10b981]' : 'bg-[var(--color-bg-active)]'
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full transition-transform shadow-sm',
                      draft.includeToday && 'translate-x-5'
                    )}
                  />
                </button>
              </div>
            </>
          )}

          {/* Absolute Fields */}
          {draft.kind === 'absolute' && (
            <>
              <div>
                <label className="text-xs text-[var(--color-text-tertiary)] mb-1.5 block">
                  {t('settings.customRanges.startDate')}
                </label>
                <input
                  type="date"
                  value={draft.startDate}
                  onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
                  className="w-full bg-[var(--color-bg-hover)] border border-[var(--color-border-base)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[#3b82f6] transition-colors"
                  style={{ colorScheme: 'var(--color-scheme)' }}
                />
              </div>
              <div>
                <label className="text-xs text-[var(--color-text-tertiary)] mb-1.5 block">
                  {t('settings.customRanges.endDate')}
                </label>
                <input
                  type="date"
                  value={draft.endDate}
                  onChange={(e) => setDraft({ ...draft, endDate: e.target.value })}
                  className="w-full bg-[var(--color-bg-hover)] border border-[var(--color-border-base)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[#3b82f6] transition-colors"
                  style={{ colorScheme: 'var(--color-scheme)' }}
                />
              </div>
            </>
          )}

          {/* Show in Header Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">{t('settings.customRanges.headerPin')}</div>
              <div className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                {t('settings.customRanges.headerPinDesc') || 'Show this range as a quick filter in the header'}
              </div>
            </div>
            <button
              role="switch"
              aria-checked={draft.showInHeader}
              onClick={() => setDraft({ ...draft, showInHeader: !draft.showInHeader })}
              className={cn(
                'relative w-12 h-7 rounded-full transition-colors shrink-0',
                draft.showInHeader ? 'bg-[#10b981]' : 'bg-[var(--color-bg-active)]'
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full transition-transform shadow-sm',
                  draft.showInHeader && 'translate-x-5'
                )}
              />
            </button>
          </div>

          {/* Error */}
          {error && (
            <p className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-[var(--color-border-base)]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-[var(--color-bg-hover)] border border-[var(--color-border-base)] text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-active)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-lg bg-[#3b82f6] text-sm font-medium text-white hover:bg-[#2563eb] transition-colors shadow-md shadow-blue-500/20"
          >
            {isEditMode ? t('common.save') || 'Save' : t('settings.customRanges.add')}
          </button>
        </div>
      </div>
    </div>
  );
}
