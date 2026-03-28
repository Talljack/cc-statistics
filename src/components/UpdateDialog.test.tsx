import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { UpdateDialog } from './UpdateDialog';

const openUrlMock = vi.fn();

let mockStoreState = {
  status: 'error',
  dialogOpen: true,
  currentVersion: '0.2.6',
  newVersion: '0.2.7',
  changelog: 'See the assets to download this version and install.',
  downloadProgress: 0,
  downloadedBytes: 0,
  totalBytes: 0,
  error: {
    stage: 'download',
    titleKey: 'update.downloadFailedTitle',
    summaryKey: 'update.errorSummaryRequest',
    suggestionKeys: [
      'update.suggestionRetry',
      'update.suggestionCheckNetwork',
      'update.suggestionOpenReleasePage',
    ],
    technicalDetails: 'stage=download\nerror sending request for url\nhttps://github.com/Talljack/cc-statistics/releases/download/v0.2.7/CC.Statistics_aarch64.app.tar.gz',
    url: 'https://github.com/Talljack/cc-statistics/releases/download/v0.2.7/CC.Statistics_aarch64.app.tar.gz',
  },
  setDialogOpen: vi.fn(),
  downloadAndInstall: vi.fn(),
  installUpdate: vi.fn(),
  checkForUpdate: vi.fn(),
};

vi.mock('../stores/updateStore', () => ({
  useUpdateStore: () => mockStoreState,
}));

vi.mock('../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string) => ({
      'update.softwareUpdate': 'Software Update',
      'update.newVersionAvailable': 'A new version is available',
      'update.whatsNew': "WHAT'S NEW",
      'update.downloadFailedTitle': "Couldn't download the update",
      'update.errorSummaryRequest': 'The update request failed before the file could be downloaded.',
      'update.suggestionRetry': 'Try again in a moment.',
      'update.suggestionCheckNetwork': 'Check your network connection, VPN, or proxy settings.',
      'update.suggestionOpenReleasePage': 'If it keeps failing, open the latest release page and download manually.',
      'update.nextSteps': 'Next Steps',
      'update.requestUrl': 'Request URL',
      'update.openReleasePage': 'Open Latest Release',
      'update.copyDiagnostics': 'Copy Diagnostics',
      'update.copiedDiagnostics': 'Diagnostics Copied',
      'update.showTechnicalDetails': 'View Technical Details',
      'update.hideTechnicalDetails': 'Hide Technical Details',
      'update.technicalDetails': 'Technical Details',
      'common.cancel': 'Cancel',
      'common.retry': 'Retry',
    }[key] ?? key),
  }),
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: (...args: unknown[]) => openUrlMock(...args),
}));

describe('UpdateDialog error state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreState = {
      ...mockStoreState,
      setDialogOpen: vi.fn(),
      downloadAndInstall: vi.fn(),
      installUpdate: vi.fn(),
      checkForUpdate: vi.fn(),
    };
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  it('shows friendly recovery guidance and keeps technical details behind a toggle', async () => {
    render(<UpdateDialog />);

    expect(screen.getByText("Couldn't download the update")).toBeInTheDocument();
    expect(screen.getByText('The update request failed before the file could be downloaded.')).toBeInTheDocument();
    expect(screen.getByText((content) => content.includes('Try again in a moment.'))).toBeInTheDocument();
    expect(screen.queryByText('stage=download')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'View Technical Details' }));
    expect(await screen.findByText('stage=download', { exact: false })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open Latest Release' }));
    expect(openUrlMock).toHaveBeenCalledWith('https://github.com/Talljack/cc-statistics/releases/latest');

    fireEvent.click(screen.getByRole('button', { name: 'Copy Diagnostics' }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(mockStoreState.error.technicalDetails);

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mockStoreState.downloadAndInstall).toHaveBeenCalledTimes(1);
  });
});
