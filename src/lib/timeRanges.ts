import type { ActiveTimeRange, BuiltInTimeRangeKey, SavedTimeRange, TimeRangeDraft } from '../components/time-ranges/types';

export type { ActiveTimeRange, BuiltInTimeRangeKey, SavedTimeRange, TimeRangeDraft } from '../components/time-ranges/types';

// ── Serialization for Tauri backend ────────────────────────────────
export interface SerializedTimeRangeQuery {
  kind: 'built_in' | 'relative' | 'absolute';
  key?: BuiltInTimeRangeKey;
  days?: number;
  include_today?: boolean;
  start_date?: string;
  end_date?: string;
}

/**
 * Resolve ActiveTimeRange + savedRanges into the payload the Rust backend expects.
 * Also returns a legacy `timeFilter` string for backward-compat and a stable queryKey.
 */
export function serializeTimeRangeForQuery(
  active: ActiveTimeRange,
  savedRanges: SavedTimeRange[],
): { timeRange: SerializedTimeRangeQuery; timeFilter: string; queryKey: string } {
  if (active.kind === 'built_in') {
    return {
      timeRange: { kind: 'built_in', key: active.key },
      timeFilter: active.key,
      queryKey: `built_in:${active.key}`,
    };
  }

  if (active.kind === 'ad_hoc') {
    return {
      timeRange: { kind: 'absolute', start_date: active.startDate, end_date: active.endDate },
      timeFilter: 'all',
      queryKey: `ad_hoc:${active.startDate}:${active.endDate}`,
    };
  }

  // kind === 'custom' — look up the saved range
  const saved = savedRanges.find((r) => r.id === active.id);
  if (!saved) {
    // Fallback to today if the saved range was deleted
    return {
      timeRange: { kind: 'built_in', key: 'today' },
      timeFilter: 'today',
      queryKey: 'built_in:today',
    };
  }

  if (saved.kind === 'relative') {
    return {
      timeRange: { kind: 'relative', days: saved.days, include_today: saved.includeToday },
      timeFilter: `days_${saved.days}`,
      queryKey: `relative:${saved.days}:${saved.includeToday}`,
    };
  }

  return {
    timeRange: { kind: 'absolute', start_date: saved.startDate, end_date: saved.endDate },
    timeFilter: 'all',
    queryKey: `absolute:${saved.startDate}:${saved.endDate}`,
  };
}

// ── Header helpers ────────────────────────────────────────────────

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
});

export function formatDateForLabel(dateValue: string) {
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateValue;
  return dateFormatter.format(date);
}

export function formatSavedTimeRangeLabel(range: SavedTimeRange) {
  if (range.kind === 'relative') return range.label || `Last ${range.days} Days`;
  return range.label || `${formatDateForLabel(range.startDate)} - ${formatDateForLabel(range.endDate)}`;
}

export function formatActiveTimeRangeLabel(range: ActiveTimeRange, savedRanges: SavedTimeRange[]) {
  if (range.kind === 'built_in') return range.key;
  if (range.kind === 'ad_hoc') return `${formatDateForLabel(range.startDate)} - ${formatDateForLabel(range.endDate)}`;
  const saved = savedRanges.find((r) => r.id === range.id);
  return saved ? formatSavedTimeRangeLabel(saved) : 'Custom';
}

export function getVisibleHeaderRanges(savedRanges: SavedTimeRange[]) {
  return [...savedRanges]
    .filter((r) => r.showInHeader)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .slice(0, 2);
}

export function isSameActiveTimeRange(a: ActiveTimeRange, b: ActiveTimeRange) {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'built_in' && b.kind === 'built_in') return a.key === b.key;
  if (a.kind === 'custom' && b.kind === 'custom') return a.id === b.id;
  if (a.kind === 'ad_hoc' && b.kind === 'ad_hoc') return a.startDate === b.startDate && a.endDate === b.endDate;
  return false;
}

export function getNextSortOrder(savedRanges: SavedTimeRange[]) {
  return savedRanges.length === 0 ? 0 : Math.max(...savedRanges.map((r) => r.sortOrder)) + 1;
}

// ── Draft builders ─────────────────────────────────────────────────

export function getTodayInputValue() {
  const now = new Date();
  return `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-${`${now.getDate()}`.padStart(2, '0')}`;
}

export function createDefaultRelativeDraft(): TimeRangeDraft {
  return { label: '', kind: 'relative', days: 2, includeToday: true, showInHeader: true };
}

export function createDefaultAbsoluteDraft(): TimeRangeDraft {
  const today = getTodayInputValue();
  return { label: '', kind: 'absolute', startDate: today, endDate: today, showInHeader: true };
}

export function createDefaultDraft(kind: TimeRangeDraft['kind']) {
  return kind === 'relative' ? createDefaultRelativeDraft() : createDefaultAbsoluteDraft();
}

export function normalizeDraftLabel(draft: TimeRangeDraft) {
  if (draft.label.trim()) return draft.label.trim();
  if (draft.kind === 'relative') return `Last ${draft.days} Days`;
  return `${formatDateForLabel(draft.startDate)} - ${formatDateForLabel(draft.endDate)}`;
}

export function buildSavedTimeRangeFromDraft(draft: TimeRangeDraft, sortOrder = 0): SavedTimeRange {
  const label = normalizeDraftLabel(draft);
  if (draft.kind === 'relative') {
    return {
      id: draft.id ?? crypto.randomUUID(),
      label,
      kind: 'relative',
      days: draft.days,
      includeToday: draft.includeToday,
      showInHeader: draft.showInHeader,
      sortOrder,
    };
  }
  return {
    id: draft.id ?? crypto.randomUUID(),
    label,
    kind: 'absolute',
    startDate: draft.startDate,
    endDate: draft.endDate,
    showInHeader: draft.showInHeader,
    sortOrder,
  };
}

export function toAdHocRange(startDate: string, endDate: string): ActiveTimeRange {
  return { kind: 'ad_hoc', startDate, endDate };
}

export function toBuiltInRange(key: BuiltInTimeRangeKey): ActiveTimeRange {
  return { kind: 'built_in', key };
}

export function toCustomRange(id: string): ActiveTimeRange {
  return { kind: 'custom', id };
}
