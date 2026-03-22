export type BuiltInTimeRangeKey = 'today' | 'week' | 'month' | 'all';

export type ActiveTimeRange =
  | { kind: 'built_in'; key: BuiltInTimeRangeKey }
  | { kind: 'custom'; id: string }
  | { kind: 'ad_hoc'; startDate: string; endDate: string };

export type SavedTimeRange =
  | {
      id: string;
      label: string;
      kind: 'relative';
      days: number;
      includeToday: boolean;
      showInHeader: boolean;
      sortOrder: number;
    }
  | {
      id: string;
      label: string;
      kind: 'absolute';
      startDate: string;
      endDate: string;
      showInHeader: boolean;
      sortOrder: number;
    };

export type TimeRangeDraft =
  | {
      id?: string;
      label: string;
      kind: 'relative';
      days: number;
      includeToday: boolean;
      showInHeader: boolean;
    }
  | {
      id?: string;
      label: string;
      kind: 'absolute';
      startDate: string;
      endDate: string;
      showInHeader: boolean;
    };

