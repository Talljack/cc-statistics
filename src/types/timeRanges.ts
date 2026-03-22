export type BuiltInTimeRangeKey = 'today' | 'week' | 'month' | 'all';

export interface BuiltInTimeRangeSelection {
  kind: 'built_in';
  key: BuiltInTimeRangeKey;
}

export interface RelativeTimeRangeSelection {
  kind: 'relative';
  days: number;
  includeToday: boolean;
}

export interface AbsoluteTimeRangeSelection {
  kind: 'absolute';
  startDate: string;
  endDate: string;
}

export type TimeRangeSelection =
  | BuiltInTimeRangeSelection
  | RelativeTimeRangeSelection
  | AbsoluteTimeRangeSelection;

export interface SavedTimeRangeBase {
  id: string;
  label: string;
  showInHeader: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface SavedRelativeTimeRange extends SavedTimeRangeBase, RelativeTimeRangeSelection {
  kind: 'relative';
}

export interface SavedAbsoluteTimeRange extends SavedTimeRangeBase, AbsoluteTimeRangeSelection {
  kind: 'absolute';
}

export type SavedTimeRange = SavedRelativeTimeRange | SavedAbsoluteTimeRange;

export interface LegacyCustomTimeFilter {
  label: string;
  days: number;
}

export interface SerializedTimeRangeQuery {
  kind: 'built_in' | 'relative' | 'absolute';
  key?: BuiltInTimeRangeKey;
  days?: number;
  includeToday?: boolean;
  startDate?: string;
  endDate?: string;
}

export interface SerializedTimeRangeRequest {
  timeFilter: string;
  timeRange: SerializedTimeRangeQuery;
  queryKey: string;
}

