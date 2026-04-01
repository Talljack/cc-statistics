import { useEffect, useRef } from 'react';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';
import { useSettingsStore } from '../stores/settingsStore';
import { checkAlerts, type AlertConfig, type AlertInput } from '../lib/alerts';
import type { ProviderUsage } from '../types/statistics';

export function useAlerts(
  dailyCost: number,
  dailyTokens: number,
  accountProviders?: ProviderUsage[],
) {
  const alertsEnabled = useSettingsStore((s) => s.alertsEnabled);
  const dailyCostLimit = useSettingsStore((s) => s.dailyCostLimit);
  const dailyTokenLimit = useSettingsStore((s) => s.dailyTokenLimit);
  const sessionWindowWarning = useSettingsStore((s) => s.sessionWindowWarning);
  const alertsMutedUntil = useSettingsStore((s) => s.alertsMutedUntil);
  const setAlertsMutedUntil = useSettingsStore((s) => s.setAlertsMutedUntil);

  const lastAlertKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!alertsEnabled) return;

    if (alertsMutedUntil) {
      const mutedUntil = new Date(alertsMutedUntil);
      if (mutedUntil > new Date()) {
        return;
      }
      setAlertsMutedUntil(null);
    }

    const sessionUsedPercent = accountProviders?.length
      ? Math.max(...accountProviders.map((p) => p.sessionUsedPercent), 0)
      : 0;

    const config: AlertConfig = {
      enabled: alertsEnabled,
      dailyCostLimit,
      dailyTokenLimit,
      sessionWindowWarning,
    };

    const input: AlertInput = {
      dailyCost,
      dailyTokens,
      sessionUsedPercent,
    };

    const result = checkAlerts(config, input);
    if (result.alerts.length === 0) {
      lastAlertKeyRef.current = null;
      return;
    }

    const alertKey = result.alerts.map((a) => a.kind).sort().join(',');
    if (alertKey === lastAlertKeyRef.current) {
      return;
    }
    lastAlertKeyRef.current = alertKey;

    void (async () => {
      let permissionGranted = await isPermissionGranted();
      if (!permissionGranted) {
        const permission = await requestPermission();
        permissionGranted = permission === 'granted';
      }

      if (!permissionGranted) return;

      await sendNotification({
        title: 'CC Statistics Alert',
        body: result.alerts.map((a) => a.message).join('\n'),
      });

      const nextMidnight = new Date();
      nextMidnight.setHours(24, 0, 0, 0);
      setAlertsMutedUntil(nextMidnight.toISOString());
    })();
  }, [
    alertsEnabled,
    dailyCost,
    dailyTokens,
    accountProviders,
    dailyCostLimit,
    dailyTokenLimit,
    sessionWindowWarning,
    alertsMutedUntil,
    setAlertsMutedUntil,
  ]);
}
