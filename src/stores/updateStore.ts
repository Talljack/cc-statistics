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

interface UpdateStore {
  status: UpdateStatus;
  currentVersion: string;
  newVersion: string;
  changelog: string;
  downloadProgress: number;
  downloadedBytes: number;
  totalBytes: number;
  error: string;
  dialogOpen: boolean;
  update: Update | null;

  setDialogOpen: (open: boolean) => void;
  checkForUpdate: () => Promise<void>;
  downloadAndInstall: () => Promise<void>;
  installUpdate: () => Promise<void>;
}

export const useUpdateStore = create<UpdateStore>()((set, get) => ({
  status: 'idle',
  currentVersion: '',
  newVersion: '',
  changelog: '',
  downloadProgress: 0,
  downloadedBytes: 0,
  totalBytes: 0,
  error: '',
  dialogOpen: false,
  update: null,

  setDialogOpen: (open) => set({ dialogOpen: open }),

  checkForUpdate: async () => {
    try {
      set({ status: 'checking', error: '' });

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
        });
      } else {
        set({ status: 'idle' });
      }
    } catch (e) {
      console.error('Update check failed:', e);
      set({ status: 'error', error: String(e) });
    }
  },

  downloadAndInstall: async () => {
    const { update } = get();
    if (!update) return;

    try {
      set({
        status: 'downloading',
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
      set({ status: 'error', error: String(e) });
    }
  },

  installUpdate: async () => {
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  },
}));
