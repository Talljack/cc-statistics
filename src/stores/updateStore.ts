import { create } from 'zustand';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { getVersion } from '@tauri-apps/api/app';

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export type UpdateFailureStage = 'check' | 'download' | 'install';

export interface UpdateFailureDetails {
  stage: UpdateFailureStage;
  titleKey: string;
  summaryKey: string;
  suggestionKeys: string[];
  technicalDetails: string;
  url: string | null;
}

interface UpdateStore {
  status: UpdateStatus;
  currentVersion: string;
  newVersion: string;
  changelog: string;
  downloadProgress: number;
  downloadedBytes: number;
  totalBytes: number;
  error: UpdateFailureDetails | null;
  dialogOpen: boolean;
  update: Update | null;

  setDialogOpen: (open: boolean) => void;
  checkForUpdate: () => Promise<void>;
  downloadAndInstall: () => Promise<void>;
  installUpdate: () => Promise<void>;
}

const URL_REGEX = /https?:\/\/[^\s)>\]}]+/i;

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }

  return result;
}

function collectErrorFragments(value: unknown, seen = new WeakSet<object>()): string[] {
  if (value == null) return [];

  if (typeof value === 'string') {
    return value.trim() ? [value.trim()] : [];
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return [String(value)];
  }

  if (value instanceof Error) {
    return dedupeStrings([
      value.message,
      ...collectErrorFragments((value as Error & { cause?: unknown }).cause, seen),
    ]);
  }

  if (Array.isArray(value)) {
    return dedupeStrings(value.flatMap((item) => collectErrorFragments(item, seen)));
  }

  if (typeof value === 'object') {
    if (seen.has(value)) return [];
    seen.add(value);

    const record = value as Record<string, unknown>;
    const preferredKeys = ['message', 'error', 'details', 'description', 'reason', 'statusText', 'url'];
    const preferredValues = preferredKeys.flatMap((key) => collectErrorFragments(record[key], seen));
    const causeValues = collectErrorFragments(record.cause, seen);

    const fallback =
      preferredValues.length === 0 && causeValues.length === 0
        ? [JSON.stringify(record)]
        : [];

    return dedupeStrings([...preferredValues, ...causeValues, ...fallback]);
  }

  return [String(value)];
}

function extractErrorUrl(fragments: string[]): string | null {
  for (const fragment of fragments) {
    const match = fragment.match(URL_REGEX);
    if (match) return match[0];
  }

  return null;
}

function includesAny(text: string, patterns: string[]): boolean {
  return patterns.some((pattern) => text.includes(pattern));
}

export function parseUpdateFailure(error: unknown, stage: UpdateFailureStage): UpdateFailureDetails {
  const fragments = dedupeStrings(collectErrorFragments(error));
  const technicalLines = dedupeStrings([
    `stage=${stage}`,
    ...fragments,
  ]);
  const technicalDetails = technicalLines.join('\n');
  const url = extractErrorUrl(fragments);
  const haystack = technicalDetails.toLowerCase();

  const isNotFound = includesAny(haystack, [' 404', 'not found', 'no such file']);
  const isSsl = includesAny(haystack, ['ssl', 'tls', 'certificate', 'x509']);
  const isTimeout = includesAny(haystack, ['timed out', 'timeout', 'deadline exceeded']);
  const isRequestFailure = includesAny(haystack, ['error sending request', 'connection reset', 'connection refused', 'network', 'dns']);

  let summaryKey = `update.${stage}FailedSummary`;
  if (isNotFound) {
    summaryKey = 'update.errorSummaryReleaseSync';
  } else if (isSsl) {
    summaryKey = 'update.errorSummarySecureConnection';
  } else if (isTimeout) {
    summaryKey = 'update.errorSummaryTimeout';
  } else if (isRequestFailure) {
    summaryKey = 'update.errorSummaryRequest';
  }

  const suggestionKeys = new Set<string>(['update.suggestionRetry']);
  if (isNotFound) {
    suggestionKeys.add('update.suggestionWaitForSync');
    suggestionKeys.add('update.suggestionOpenReleasePage');
  } else if (isSsl) {
    suggestionKeys.add('update.suggestionCheckNetwork');
    suggestionKeys.add('update.suggestionCheckProxy');
  } else if (isTimeout || isRequestFailure) {
    suggestionKeys.add('update.suggestionCheckNetwork');
    suggestionKeys.add('update.suggestionOpenReleasePage');
  } else {
    suggestionKeys.add('update.suggestionCheckNetwork');
  }

  return {
    stage,
    titleKey: `update.${stage}FailedTitle`,
    summaryKey,
    suggestionKeys: [...suggestionKeys],
    technicalDetails,
    url,
  };
}

export const useUpdateStore = create<UpdateStore>()((set, get) => ({
  status: 'idle',
  currentVersion: '',
  newVersion: '',
  changelog: '',
  downloadProgress: 0,
  downloadedBytes: 0,
  totalBytes: 0,
  error: null,
  dialogOpen: false,
  update: null,

  setDialogOpen: (open) => set({ dialogOpen: open }),

  checkForUpdate: async () => {
    try {
      set({ status: 'checking', error: null });

      const currentVersion = await getVersion();
      set({ currentVersion });

      const update = await check();

      if (update) {
        set({
          status: 'available',
          newVersion: update.version,
          changelog: update.body || '',
          update,
          dialogOpen: true,
          error: null,
        });
      } else {
        set({ status: 'idle', error: null });
      }
    } catch (e) {
      console.error('Update check failed:', e);
      set({ status: 'error', error: parseUpdateFailure(e, 'check') });
    }
  },

  downloadAndInstall: async () => {
    const { update } = get();
    if (!update) return;

    try {
      set({
        status: 'downloading',
        error: null,
        downloadProgress: 0,
        downloadedBytes: 0,
        totalBytes: 0,
      });

      let contentLength = 0;
      let downloaded = 0;

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength ?? 0;
            set({ totalBytes: contentLength });
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            set({
              downloadedBytes: downloaded,
              downloadProgress: contentLength > 0
                ? Math.round((downloaded / contentLength) * 100)
                : 0,
            });
            break;
          case 'Finished':
            set({ status: 'downloaded', downloadProgress: 100 });
            break;
        }
      });
    } catch (e) {
      console.error('Download failed:', e);
      set({ status: 'error', error: parseUpdateFailure(e, 'download') });
    }
  },

  installUpdate: async () => {
    try {
      set({ error: null });
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (e) {
      console.error('Install failed:', e);
      set({ status: 'error', error: parseUpdateFailure(e, 'install') });
    }
  },
}));
