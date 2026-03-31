import { useState } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { useFilterStore } from '../../stores/filterStore';
import { useTranslation } from '../../lib/i18n';
import { cn } from '../../lib/utils';
import {
  formatSavedTimeRangeLabel,
  isSameActiveTimeRange,
  type ActiveTimeRange,
  type SavedTimeRange,
} from '../../lib/timeRanges';
import { EditTimeRangeDialog } from './EditTimeRangeDialog';
import { Clock, Plus, Pencil, Trash2, Star, Eye } from 'lucide-react';

const MAX_SAVED_RANGES = 12;

const BUILT_IN_KEYS = ['today', 'week', 'month', 'all'] as const;

function builtInLabel(key: string, t: (k: string) => string): string {
  const map: Record<string, string> = {
    today: t('header.today'),
    week: t('header.week'),
    month: t('header.month'),
    all: t('header.all'),
  };
  return map[key] || key;
}

export function TimeRangeManagementSection() {
  const { t } = useTranslation();
  const {
    defaultTimeRange,
    savedTimeRanges,
    setDefaultTimeRange,
    removeSavedTimeRange,
    updateSavedTimeRange,
  } = useSettingsStore();
  const { activeTimeRange, setActiveTimeRange } = useFilterStore();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRange, setEditingRange] = useState<SavedTimeRange | undefined>(undefined);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleSetDefault = (range: ActiveTimeRange) => {
    setDefaultTimeRange(range);
  };

  const handleDelete = (id: string) => {
    // If the deleted range is the currently active range in filterStore, fall back to Today
    if (activeTimeRange.kind === 'custom' && activeTimeRange.id === id) {
      setActiveTimeRange({ kind: 'built_in', key: 'today' });
    }
    // removeSavedTimeRange already handles fallback for defaultTimeRange
    removeSavedTimeRange(id);
    setDeletingId(null);
  };

  const handleToggleHeaderPin = (range: SavedTimeRange) => {
    const updated: SavedTimeRange = { ...range, showInHeader: !range.showInHeader };
    updateSavedTimeRange(range.id, updated);
  };

  const handleOpenCreate = () => {
    setEditingRange(undefined);
    setDialogOpen(true);
  };

  const handleOpenEdit = (range: SavedTimeRange) => {
    setEditingRange(range);
    setDialogOpen(true);
  };

  const isDefaultRange = (range: ActiveTimeRange): boolean => {
    return isSameActiveTimeRange(defaultTimeRange, range);
  };

  return (
    <>
      {/* Default Time Range */}
      <section>
        <h3 className="text-base font-semibold mb-1">{t('settings.timeRange.title')}</h3>
        <p className="text-xs text-[var(--color-text-tertiary)] mb-3">{t('settings.timeRange.desc')}</p>
        <div className="flex flex-wrap bg-[var(--color-bg-hover)] border border-[var(--color-border-base)] rounded-lg p-1 w-fit gap-0.5">
          {BUILT_IN_KEYS.map((key) => {
            const range: ActiveTimeRange = { kind: 'built_in', key };
            const selected = isDefaultRange(range);
            return (
              <button
                key={key}
                onClick={() => handleSetDefault(range)}
                className={cn(
                  'px-4 py-2 rounded-md text-sm font-medium transition-all',
                  selected
                    ? 'bg-[#3b82f6] text-white shadow-md shadow-blue-500/20'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                )}
              >
                {builtInLabel(key, t)}
              </button>
            );
          })}
          {savedTimeRanges.map((sr) => {
            const range: ActiveTimeRange = { kind: 'custom', id: sr.id };
            const selected = isDefaultRange(range);
            return (
              <button
                key={sr.id}
                onClick={() => handleSetDefault(range)}
                className={cn(
                  'px-4 py-2 rounded-md text-sm font-medium transition-all',
                  selected
                    ? 'bg-[#3b82f6] text-white shadow-md shadow-blue-500/20'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                )}
              >
                {formatSavedTimeRangeLabel(sr)}
              </button>
            );
          })}
        </div>
      </section>

      {/* Custom Time Ranges */}
      <section>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-semibold">{t('settings.customRanges.title')}</h3>
          <span className="text-xs text-[var(--color-text-muted)]">
            {savedTimeRanges.length}/{MAX_SAVED_RANGES}
          </span>
        </div>
        <p className="text-xs text-[var(--color-text-tertiary)] mb-3">{t('settings.customRanges.desc')}</p>

        {/* Saved Ranges List */}
        {savedTimeRanges.length === 0 ? (
          <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-base)] border-dashed rounded-xl p-6 text-center">
            <Clock className="w-8 h-8 text-[var(--color-text-faint)] mx-auto mb-2" />
            <p className="text-sm text-[var(--color-text-muted)]">{t('settings.customRanges.empty')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {savedTimeRanges.map((range) => {
              const customActive: ActiveTimeRange = { kind: 'custom', id: range.id };
              const isDefault = isDefaultRange(customActive);
              const isActive =
                activeTimeRange.kind === 'custom' && activeTimeRange.id === range.id;
              const isDeleting = deletingId === range.id;

              return (
                <div
                  key={range.id}
                  className="bg-[var(--color-bg-surface)] border border-[var(--color-border-base)] rounded-xl px-4 py-3 flex items-center gap-3"
                >
                  {/* Label + badges */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">
                        {formatSavedTimeRangeLabel(range)}
                      </span>
                      <span
                        className={cn(
                          'text-[10px] font-medium px-1.5 py-0.5 rounded-full uppercase tracking-wider',
                          range.kind === 'relative'
                            ? 'bg-blue-500/15 text-blue-400'
                            : 'bg-purple-500/15 text-purple-400'
                        )}
                      >
                        {range.kind === 'relative'
                          ? t('settings.customRanges.relative')
                          : t('settings.customRanges.absolute')}
                      </span>
                      {isDefault && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 uppercase tracking-wider">
                          {t('settings.customRanges.isDefault')}
                        </span>
                      )}
                      {isActive && !isDefault && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 uppercase tracking-wider">
                          {t('settings.customRanges.isActive')}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[var(--color-text-muted)] mt-0.5">
                      {range.kind === 'relative'
                        ? `${range.days} ${t('settings.customRanges.days')}${range.includeToday ? ` (+${t('settings.customRanges.includeToday')})` : ''}`
                        : `${range.startDate} - ${range.endDate}`}
                    </div>
                  </div>

                  {/* Header pin toggle */}
                  <button
                    onClick={() => handleToggleHeaderPin(range)}
                    title={t('settings.customRanges.headerPin')}
                    className={cn(
                      'p-1.5 rounded-lg transition-colors',
                      range.showInHeader
                        ? 'text-[#3b82f6] bg-[#3b82f6]/10 hover:bg-[#3b82f6]/20'
                        : 'text-[var(--color-text-faint)] hover:text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)]'
                    )}
                  >
                    <Eye className="w-4 h-4" />
                  </button>

                  {/* Default star */}
                  <button
                    onClick={() => handleSetDefault(customActive)}
                    title={t('settings.customRanges.setDefault')}
                    className={cn(
                      'p-1.5 rounded-lg transition-colors',
                      isDefault
                        ? 'text-amber-400 bg-amber-400/10 hover:bg-amber-400/20'
                        : 'text-[var(--color-text-faint)] hover:text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)]'
                    )}
                  >
                    <Star className="w-4 h-4" />
                  </button>

                  {/* Edit button */}
                  <button
                    onClick={() => handleOpenEdit(range)}
                    title={t('settings.customRanges.edit')}
                    className="p-1.5 rounded-lg text-[var(--color-text-faint)] hover:text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>

                  {/* Delete button with confirmation */}
                  {isDeleting ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDelete(range.id)}
                        className="px-2 py-1 rounded-md bg-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/30 transition-colors"
                      >
                        {t('common.confirm')}
                      </button>
                      <button
                        onClick={() => setDeletingId(null)}
                        className="px-2 py-1 rounded-md bg-[var(--color-bg-hover)] border border-[var(--color-border-base)] text-[var(--color-text-tertiary)] text-xs font-medium hover:bg-[var(--color-bg-active)] transition-colors"
                      >
                        {t('common.cancel')}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeletingId(range.id)}
                      title={t('settings.customRanges.delete')}
                      className="p-1.5 rounded-lg text-[var(--color-text-faint)] hover:text-red-400 hover:bg-red-400/10 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Add Range Button */}
        <div className="mt-3">
          {savedTimeRanges.length >= MAX_SAVED_RANGES ? (
            <p className="text-xs text-[var(--color-text-tertiary)]">{t('settings.customRanges.maxReached')}</p>
          ) : (
            <button
              onClick={handleOpenCreate}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-[var(--color-border-strong)] text-sm font-medium text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:border-[#3b82f6] hover:bg-[#3b82f6]/5 transition-all w-full justify-center"
            >
              <Plus className="w-4 h-4" />
              {t('settings.customRanges.add')}
            </button>
          )}
        </div>
      </section>

      {/* Edit/Create Dialog */}
      <EditTimeRangeDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        editingRange={editingRange}
      />
    </>
  );
}
