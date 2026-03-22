import { describe, expect, it } from 'vitest';
import {
  getVisibleHeaderRanges,
  serializeTimeRangeForQuery,
  isSameActiveTimeRange,
  formatSavedTimeRangeLabel,
  buildSavedTimeRangeFromDraft,
  getNextSortOrder,
} from './timeRanges';
import type { SavedTimeRange } from './timeRanges';

describe('getVisibleHeaderRanges', () => {
  it('returns empty for no saved ranges', () => {
    expect(getVisibleHeaderRanges([])).toHaveLength(0);
  });

  it('returns at most two pinned custom ranges', () => {
    const ranges: SavedTimeRange[] = [
      { id: '1', label: 'A', kind: 'relative', days: 2, includeToday: true, showInHeader: true, sortOrder: 0 },
      { id: '2', label: 'B', kind: 'relative', days: 7, includeToday: true, showInHeader: true, sortOrder: 1 },
      { id: '3', label: 'C', kind: 'relative', days: 14, includeToday: true, showInHeader: true, sortOrder: 2 },
    ];
    const visible = getVisibleHeaderRanges(ranges);
    expect(visible).toHaveLength(2);
    expect(visible[0].id).toBe('1');
    expect(visible[1].id).toBe('2');
  });

  it('skips ranges not pinned to header', () => {
    const ranges: SavedTimeRange[] = [
      { id: '1', label: 'A', kind: 'relative', days: 2, includeToday: true, showInHeader: false, sortOrder: 0 },
      { id: '2', label: 'B', kind: 'relative', days: 7, includeToday: true, showInHeader: true, sortOrder: 1 },
    ];
    const visible = getVisibleHeaderRanges(ranges);
    expect(visible).toHaveLength(1);
    expect(visible[0].id).toBe('2');
  });
});

describe('serializeTimeRangeForQuery', () => {
  it('serializes a built-in range', () => {
    const result = serializeTimeRangeForQuery({ kind: 'built_in', key: 'today' }, []);
    expect(result.timeRange).toEqual({ kind: 'built_in', key: 'today' });
    expect(result.timeFilter).toBe('today');
  });

  it('serializes an ad hoc absolute range payload', () => {
    const result = serializeTimeRangeForQuery(
      { kind: 'ad_hoc', startDate: '2026-03-01', endDate: '2026-03-15' },
      [],
    );
    expect(result.timeRange).toEqual({
      kind: 'absolute',
      start_date: '2026-03-01',
      end_date: '2026-03-15',
    });
  });

  it('serializes a custom relative range by ID', () => {
    const saved: SavedTimeRange[] = [
      { id: 'r1', label: 'Last 14 Days', kind: 'relative', days: 14, includeToday: true, showInHeader: false, sortOrder: 0 },
    ];
    const result = serializeTimeRangeForQuery({ kind: 'custom', id: 'r1' }, saved);
    expect(result.timeRange).toEqual({ kind: 'relative', days: 14, include_today: true });
  });

  it('falls back to today when custom range ID is missing', () => {
    const result = serializeTimeRangeForQuery({ kind: 'custom', id: 'nonexistent' }, []);
    expect(result.timeRange).toEqual({ kind: 'built_in', key: 'today' });
    expect(result.queryKey).toBe('built_in:today');
  });
});

describe('isSameActiveTimeRange', () => {
  it('matches built-in ranges by key', () => {
    expect(isSameActiveTimeRange({ kind: 'built_in', key: 'today' }, { kind: 'built_in', key: 'today' })).toBe(true);
    expect(isSameActiveTimeRange({ kind: 'built_in', key: 'today' }, { kind: 'built_in', key: 'week' })).toBe(false);
  });

  it('matches custom ranges by id', () => {
    expect(isSameActiveTimeRange({ kind: 'custom', id: 'a' }, { kind: 'custom', id: 'a' })).toBe(true);
    expect(isSameActiveTimeRange({ kind: 'custom', id: 'a' }, { kind: 'custom', id: 'b' })).toBe(false);
  });

  it('does not match different kinds', () => {
    expect(isSameActiveTimeRange({ kind: 'built_in', key: 'today' }, { kind: 'custom', id: 'x' })).toBe(false);
  });
});

describe('formatSavedTimeRangeLabel', () => {
  it('uses custom label when provided', () => {
    expect(
      formatSavedTimeRangeLabel({ id: '1', label: 'Sprint 7', kind: 'absolute', startDate: '2026-03-01', endDate: '2026-03-15', showInHeader: false, sortOrder: 0 }),
    ).toBe('Sprint 7');
  });

  it('generates label for relative range without custom label', () => {
    expect(
      formatSavedTimeRangeLabel({ id: '1', label: '', kind: 'relative', days: 14, includeToday: true, showInHeader: false, sortOrder: 0 }),
    ).toBe('Last 14 Days');
  });
});

describe('buildSavedTimeRangeFromDraft', () => {
  it('builds a relative saved range', () => {
    const result = buildSavedTimeRangeFromDraft({ label: 'My Range', kind: 'relative', days: 7, includeToday: false, showInHeader: true }, 3);
    expect(result.kind).toBe('relative');
    expect(result.label).toBe('My Range');
    expect(result.sortOrder).toBe(3);
    expect(result.id).toBeTruthy();
  });
});

describe('getNextSortOrder', () => {
  it('returns 0 for empty list', () => {
    expect(getNextSortOrder([])).toBe(0);
  });

  it('returns max+1', () => {
    const ranges: SavedTimeRange[] = [
      { id: '1', label: 'A', kind: 'relative', days: 2, includeToday: true, showInHeader: true, sortOrder: 5 },
    ];
    expect(getNextSortOrder(ranges)).toBe(6);
  });
});
