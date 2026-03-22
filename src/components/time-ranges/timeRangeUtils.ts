import type { ActiveTimeRange, BuiltInTimeRangeKey, SavedTimeRange, TimeRangeDraft } from './types';

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
});

export function getTodayInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDateForLabel(dateValue: string) {
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return dateValue;
  }
  return dateFormatter.format(date);
}

export function formatSavedTimeRangeLabel(range: SavedTimeRange) {
  if (range.kind === 'relative') {
    return range.label || `Last ${range.days} Days`;
  }

  if (range.label) {
    return range.label;
  }

  return `${formatDateForLabel(range.startDate)} - ${formatDateForLabel(range.endDate)}`;
}

export function formatActiveTimeRangeLabel(range: ActiveTimeRange, savedRanges: SavedTimeRange[]) {
  if (range.kind === 'built_in') {
    return range.key;
  }

  if (range.kind === 'ad_hoc') {
    return `${formatDateForLabel(range.startDate)} - ${formatDateForLabel(range.endDate)}`;
  }

  const saved = savedRanges.find((item) => item.id === range.id);
  return saved ? formatSavedTimeRangeLabel(saved) : 'Custom';
}

export function getVisibleHeaderRanges(savedRanges: SavedTimeRange[]) {
  return [...savedRanges]
    .filter((range) => range.showInHeader)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .slice(0, 2);
}

export function isSameActiveTimeRange(a: ActiveTimeRange, b: ActiveTimeRange) {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'built_in' && b.kind === 'built_in') return a.key === b.key;
  if (a.kind === 'custom' && b.kind === 'custom') return a.id === b.id;
  if (a.kind === 'ad_hoc' && b.kind === 'ad_hoc') {
    return a.startDate === b.startDate && a.endDate === b.endDate;
  }
  return false;
}

export function isRangeVisibleInHeader(range: SavedTimeRange, visibleRanges: SavedTimeRange[]) {
  return visibleRanges.some((item) => item.id === range.id);
}

export function getNextSortOrder(savedRanges: SavedTimeRange[]) {
  return savedRanges.length === 0 ? 0 : Math.max(...savedRanges.map((item) => item.sortOrder)) + 1;
}

export function createDefaultRelativeDraft(): TimeRangeDraft {
  return {
    label: '',
    kind: 'relative',
    days: 2,
    includeToday: true,
    showInHeader: true,
  };
}

export function createDefaultAbsoluteDraft(): TimeRangeDraft {
  const today = getTodayInputValue();
  return {
    label: '',
    kind: 'absolute',
    startDate: today,
    endDate: today,
    showInHeader: true,
  };
}

export function createDefaultDraft(kind: TimeRangeDraft['kind']) {
  return kind === 'relative' ? createDefaultRelativeDraft() : createDefaultAbsoluteDraft();
}

export function normalizeDraftLabel(draft: TimeRangeDraft) {
  if (draft.label.trim()) {
    return draft.label.trim();
  }

  if (draft.kind === 'relative') {
    return `Last ${draft.days} Days`;
  }

  return `${formatDateForLabel(draft.startDate)} - ${formatDateForLabel(draft.endDate)}`;
}

export function buildSavedTimeRangeFromDraft(draft: TimeRangeDraft): SavedTimeRange {
  const label = normalizeDraftLabel(draft);
  const sortOrder = 0;

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

export function toAdHocRange(startDate: string, endDate: string) {
  return { kind: 'ad_hoc' as const, startDate, endDate };
}

export function toBuiltInRange(key: BuiltInTimeRangeKey) {
  return { kind: 'built_in' as const, key };
}

