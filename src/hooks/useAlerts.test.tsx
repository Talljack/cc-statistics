import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import type { ProviderUsage } from '../types/statistics';
import { useAlerts } from './useAlerts';

const isPermissionGrantedMock = vi.fn();
const requestPermissionMock = vi.fn();
const sendNotificationMock = vi.fn();
const setAlertsMutedUntilMock = vi.fn();
const invokeMock = vi.fn();

const settingsState = {
  alertsEnabled: true,
  dailyCostLimit: 10,
  dailyTokenLimit: 1_000,
  sessionWindowWarning: 80,
  alertsMutedUntil: null as string | null,
  setAlertsMutedUntil: setAlertsMutedUntilMock,
};

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock('@tauri-apps/plugin-notification', () => ({
  isPermissionGranted: (...args: unknown[]) => isPermissionGrantedMock(...args),
  requestPermission: (...args: unknown[]) => requestPermissionMock(...args),
  sendNotification: (...args: unknown[]) => sendNotificationMock(...args),
}));

vi.mock('../stores/settingsStore', () => ({
  useSettingsStore: (selector: (state: typeof settingsState) => unknown) => selector(settingsState),
}));

function AlertHarness(props: {
  dailyCost: number;
  dailyTokens: number;
  accountProviders?: ProviderUsage[];
}) {
  useAlerts(props.dailyCost, props.dailyTokens, props.accountProviders);
  return null;
}

describe('useAlerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settingsState.alertsEnabled = true;
    settingsState.dailyCostLimit = 10;
    settingsState.dailyTokenLimit = 1_000;
    settingsState.sessionWindowWarning = 80;
    settingsState.alertsMutedUntil = null;
    isPermissionGrantedMock.mockResolvedValue(true);
    requestPermissionMock.mockResolvedValue('granted');
    sendNotificationMock.mockResolvedValue(undefined);
    invokeMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
  });

  it('requests permission and sends a notification when a threshold is crossed', async () => {
    isPermissionGrantedMock.mockResolvedValue(false);

    render(<AlertHarness dailyCost={15} dailyTokens={500} />);

    await waitFor(() => {
      expect(requestPermissionMock).toHaveBeenCalledTimes(1);
      expect(sendNotificationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'CC Statistics Alert',
          body: expect.stringContaining('Daily cost'),
        })
      );
    });
  });

  it('deduplicates the same alert set across rerenders', async () => {
    const providers: ProviderUsage[] = [];
    const { rerender } = render(
      <AlertHarness dailyCost={15} dailyTokens={500} accountProviders={providers} />
    );

    await waitFor(() => {
      expect(sendNotificationMock).toHaveBeenCalledTimes(1);
    });

    rerender(<AlertHarness dailyCost={15} dailyTokens={500} accountProviders={providers} />);

    await waitFor(() => {
      expect(sendNotificationMock).toHaveBeenCalledTimes(1);
    });
  });

  it('skips notifications while alerts are muted', async () => {
    settingsState.alertsMutedUntil = '2099-01-01T00:00:00.000Z';

    render(<AlertHarness dailyCost={15} dailyTokens={500} />);

    await waitFor(() => {
      expect(isPermissionGrantedMock).not.toHaveBeenCalled();
      expect(requestPermissionMock).not.toHaveBeenCalled();
      expect(sendNotificationMock).not.toHaveBeenCalled();
    });
  });
});
