import { Bell } from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { useSettingsStore } from '../../stores/settingsStore';

export function AlertSettings({
  Toggle,
  SettingItem,
}: {
  Toggle: React.ComponentType<{ checked: boolean; onChange: (v: boolean) => void }>;
  SettingItem: React.ComponentType<{
    icon: React.ReactNode;
    iconColor: string;
    title: string;
    description: string;
    right: React.ReactNode;
  }>;
}) {
  const { t } = useTranslation();
  const {
    alertsEnabled,
    dailyCostLimit,
    dailyTokenLimit,
    sessionWindowWarning,
    setAlertsEnabled,
    setDailyCostLimit,
    setDailyTokenLimit,
    setSessionWindowWarning,
  } = useSettingsStore();

  return (
    <section>
      <h3 className="text-base font-semibold mb-1">{t('settings.alerts.title')}</h3>
      <p className="text-xs text-[var(--color-text-tertiary)] mb-3">{t('settings.alerts.desc')}</p>
      <div className="space-y-3">
        <SettingItem
          icon={<Bell className="w-5 h-5" />}
          iconColor="#f59e0b"
          title={t('settings.alerts.enable')}
          description={t('settings.alerts.enableDesc')}
          right={<Toggle checked={alertsEnabled} onChange={setAlertsEnabled} />}
        />

        {alertsEnabled && (
          <div className="ml-14 grid gap-3">
            <div>
              <label htmlFor="alerts-daily-cost" className="text-xs text-[var(--color-text-tertiary)] mb-1 block">{t('settings.alerts.dailyCost')}</label>
              <p className="text-[10px] text-[var(--color-text-muted)] mb-1">{t('settings.alerts.dailyCostDesc')}</p>
              <input
                id="alerts-daily-cost"
                type="number"
                min="0"
                step="1"
                value={dailyCostLimit}
                onChange={(e) => setDailyCostLimit(Number(e.target.value) || 0)}
                className="w-40 bg-[var(--color-bg-hover)] border border-[var(--color-border-base)] rounded-md px-3 py-2 text-sm font-mono text-[var(--color-text-primary)] focus:outline-none focus:border-[#3b82f6]"
              />
            </div>
            <div>
              <label htmlFor="alerts-daily-tokens" className="text-xs text-[var(--color-text-tertiary)] mb-1 block">{t('settings.alerts.dailyTokens')}</label>
              <p className="text-[10px] text-[var(--color-text-muted)] mb-1">{t('settings.alerts.dailyTokensDesc')}</p>
              <input
                id="alerts-daily-tokens"
                type="number"
                min="0"
                step="1000"
                value={dailyTokenLimit}
                onChange={(e) => setDailyTokenLimit(Number(e.target.value) || 0)}
                className="w-40 bg-[var(--color-bg-hover)] border border-[var(--color-border-base)] rounded-md px-3 py-2 text-sm font-mono text-[var(--color-text-primary)] focus:outline-none focus:border-[#3b82f6]"
              />
            </div>
            <div>
              <label htmlFor="alerts-session-window" className="text-xs text-[var(--color-text-tertiary)] mb-1 block">{t('settings.alerts.sessionWindow')}</label>
              <p className="text-[10px] text-[var(--color-text-muted)] mb-1">{t('settings.alerts.sessionWindowDesc')}</p>
              <input
                id="alerts-session-window"
                type="number"
                min="0"
                max="100"
                step="5"
                value={sessionWindowWarning}
                onChange={(e) => setSessionWindowWarning(Number(e.target.value) || 0)}
                className="w-40 bg-[var(--color-bg-hover)] border border-[var(--color-border-base)] rounded-md px-3 py-2 text-sm font-mono text-[var(--color-text-primary)] focus:outline-none focus:border-[#3b82f6]"
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
