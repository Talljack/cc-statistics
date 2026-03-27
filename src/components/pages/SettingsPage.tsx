import { useState, useEffect } from 'react';
import {
  useSettingsStore,
  type Language,
} from '../../stores/settingsStore';
import { usePricingStore } from '../../stores/pricingStore';
import { useUpdateStore } from '../../stores/updateStore';
import { useDetectSources, usePresetModels } from '../../hooks/useStatistics';
import { getVersion } from '@tauri-apps/api/app';
import { useTranslation } from '../../lib/i18n';
import { cn } from '../../lib/utils';
import type { SessionSortField } from '../../stores/settingsStore';
import { TimeRangeManagementSection } from '../settings/TimeRangeManagementSection';
import {
  Sun,
  Moon,
  Monitor,
  RefreshCw,
  FolderOpen,
  Database,
  RotateCcw,
  Shield,
  Wrench,
  Zap,
  Plug,
  ChevronDown,
  Info,
  DollarSign,
  MessageSquare,
  FileText,
  Clock,
  Cpu,
  FlaskConical,
  Layers,
  Plus,
  X,
} from 'lucide-react';

type SettingsTab = 'general' | 'advanced' | 'about';

const languages: { label: string; value: Language }[] = [
  { label: '中文', value: 'zh' },
  { label: 'English', value: 'en' },
  { label: '日本語', value: 'ja' },
];

const sortFieldKeys: { key: string; value: SessionSortField }[] = [
  { key: 'settings.sort.time', value: 'timestamp' },
  { key: 'settings.sort.cost', value: 'cost_usd' },
  { key: 'settings.sort.tokens', value: 'total_tokens' },
  { key: 'settings.sort.duration', value: 'duration_ms' },
];

const intervalKeys: { key: string; value: number }[] = [
  { key: 'settings.autoRefresh.1min', value: 1 },
  { key: 'settings.autoRefresh.5min', value: 5 },
  { key: 'settings.autoRefresh.10min', value: 10 },
  { key: 'settings.autoRefresh.30min', value: 30 },
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative w-12 h-7 rounded-full transition-colors shrink-0',
        checked ? 'bg-[#10b981]' : 'bg-[#333]'
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full transition-transform shadow-sm',
          checked && 'translate-x-5'
        )}
      />
    </button>
  );
}

function SettingItem({
  icon,
  iconColor,
  title,
  description,
  right,
}: {
  icon: React.ReactNode;
  iconColor: string;
  title: string;
  description: string;
  right: React.ReactNode;
}) {
  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-4 flex items-center gap-4">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${iconColor}20`, color: iconColor }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-[#808080] mt-0.5">{description}</div>
      </div>
      <div className="shrink-0">{right}</div>
    </div>
  );
}

function ExpandableSection({
  icon,
  iconColor,
  title,
  description,
  children,
  defaultExpanded = false,
}: {
  icon: React.ReactNode;
  iconColor: string;
  title: string;
  description: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center gap-4 hover:bg-[#1e1e1e] transition-colors"
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${iconColor}20`, color: iconColor }}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <div className="text-sm font-medium">{title}</div>
          <div className="text-xs text-[#808080] mt-0.5">{description}</div>
        </div>
        <ChevronDown
          className={cn(
            'w-5 h-5 text-[#808080] transition-transform shrink-0',
            expanded && 'rotate-180'
          )}
        />
      </button>
      {expanded && (
        <div className="px-4 pb-4 pt-0 border-t border-[#2a2a2a]">
          <div className="pt-4">{children}</div>
        </div>
      )}
    </div>
  );
}

function GeneralTab() {
  const { t } = useTranslation();
  const {
    language,
    theme,
    showCost,
    showToolUsage,
    showSkillUsage,
    showMcpUsage,
    showSessionsCard,
    showInstructionsCard,
    showDurationCard,
    showTokensCard,
    showCostCard,
    showSkillsCard,
    showMcpCard,
    autoRefreshEnabled,
    autoRefreshInterval,
    sessionSortField,
    sessionSortOrder,
    setLanguage,
    setTheme,
    setShowCost,
    setShowToolUsage,
    setShowSkillUsage,
    setShowMcpUsage,
    setShowSessionsCard,
    setShowInstructionsCard,
    setShowDurationCard,
    setShowTokensCard,
    setShowCostCard,
    setShowSkillsCard,
    setShowMcpCard,
    setAutoRefreshEnabled,
    setAutoRefreshInterval,
    setSessionSortField,
    setSessionSortOrder,
  } = useSettingsStore();

  const themeOptions = [
    { label: t('settings.appearance.light'), value: 'light' as const, icon: <Sun className="w-4 h-4" /> },
    { label: t('settings.appearance.dark'), value: 'dark' as const, icon: <Moon className="w-4 h-4" /> },
    { label: t('settings.appearance.system'), value: 'system' as const, icon: <Monitor className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6">
      {/* Language */}
      <section>
        <h3 className="text-base font-semibold mb-1">{t('settings.language.title')}</h3>
        <p className="text-xs text-[#808080] mb-3">{t('settings.language.desc')}</p>
        <div className="flex bg-[#2a2a2a] rounded-lg p-1 w-fit">
          {languages.map((lang) => (
            <button
              key={lang.value}
              onClick={() => setLanguage(lang.value)}
              className={cn(
                'px-5 py-2 rounded-md text-sm font-medium transition-all',
                language === lang.value
                  ? 'bg-[#3b82f6] text-white shadow-md shadow-blue-500/20'
                  : 'text-[#a0a0a0] hover:text-white'
              )}
            >
              {lang.label}
            </button>
          ))}
        </div>
      </section>

      {/* Theme */}
      <section>
        <h3 className="text-base font-semibold mb-1">{t('settings.appearance.title')}</h3>
        <p className="text-xs text-[#808080] mb-3">{t('settings.appearance.desc')}</p>
        <div className="flex bg-[#2a2a2a] rounded-lg p-1 w-fit">
          {themeOptions.map((th) => (
            <button
              key={th.value}
              onClick={() => setTheme(th.value)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all',
                theme === th.value
                  ? 'bg-[#3b82f6] text-white shadow-md shadow-blue-500/20'
                  : 'text-[#a0a0a0] hover:text-white'
              )}
            >
              {th.icon}
              {th.label}
            </button>
          ))}
        </div>
      </section>

      {/* Time Range Management */}
      <TimeRangeManagementSection />

      {/* Cost Display */}
      <section>
        <h3 className="text-base font-semibold mb-1">{t('settings.cost.title')}</h3>
        <p className="text-xs text-[#808080] mb-3">{t('settings.cost.desc')}</p>
        <SettingItem
          icon={<DollarSign className="w-5 h-5" />}
          iconColor="#ef4444"
          title={t('settings.cost.showStats')}
          description={t('settings.cost.showStatsDesc')}
          right={<Toggle checked={showCost} onChange={setShowCost} />}
        />
      </section>

      {/* Dashboard Cards */}
      <section>
        <h3 className="text-base font-semibold mb-1">{t('settings.cards.title')}</h3>
        <p className="text-xs text-[#808080] mb-3">{t('settings.cards.desc')}</p>
        <div className="space-y-3">
          <SettingItem icon={<MessageSquare className="w-5 h-5" />} iconColor="#3b82f6" title="Sessions" description={t('settings.cards.sessions')} right={<Toggle checked={showSessionsCard} onChange={setShowSessionsCard} />} />
          <SettingItem icon={<FileText className="w-5 h-5" />} iconColor="#22c55e" title="Instructions" description={t('settings.cards.instructions')} right={<Toggle checked={showInstructionsCard} onChange={setShowInstructionsCard} />} />
          <SettingItem icon={<Clock className="w-5 h-5" />} iconColor="#a855f7" title="Duration" description={t('settings.cards.duration')} right={<Toggle checked={showDurationCard} onChange={setShowDurationCard} />} />
          <SettingItem icon={<Cpu className="w-5 h-5" />} iconColor="#f59e0b" title="Tokens" description={t('settings.cards.tokens')} right={<Toggle checked={showTokensCard} onChange={setShowTokensCard} />} />
          {showCost && (
            <SettingItem icon={<DollarSign className="w-5 h-5" />} iconColor="#ef4444" title="Cost" description={t('settings.cards.cost')} right={<Toggle checked={showCostCard} onChange={setShowCostCard} />} />
          )}
          <SettingItem icon={<Zap className="w-5 h-5" />} iconColor="#22c55e" title="Skills" description={t('settings.cards.skills')} right={<Toggle checked={showSkillsCard} onChange={setShowSkillsCard} />} />
          <SettingItem icon={<Plug className="w-5 h-5" />} iconColor="#06b6d4" title="MCP" description={t('settings.cards.mcp')} right={<Toggle checked={showMcpCard} onChange={setShowMcpCard} />} />
        </div>
      </section>

      {/* Dashboard Chart Display */}
      <section>
        <h3 className="text-base font-semibold mb-1">{t('settings.charts.title')}</h3>
        <p className="text-xs text-[#808080] mb-3">{t('settings.charts.desc')}</p>
        <div className="space-y-3">
          <SettingItem icon={<Wrench className="w-5 h-5" />} iconColor="#3b82f6" title={t('settings.charts.toolUsage')} description={t('settings.charts.toolUsageDesc')} right={<Toggle checked={showToolUsage} onChange={setShowToolUsage} />} />
          <SettingItem icon={<Zap className="w-5 h-5" />} iconColor="#22c55e" title={t('settings.charts.skillUsage')} description={t('settings.charts.skillUsageDesc')} right={<Toggle checked={showSkillUsage} onChange={setShowSkillUsage} />} />
          <SettingItem icon={<Plug className="w-5 h-5" />} iconColor="#a855f7" title={t('settings.charts.mcpUsage')} description={t('settings.charts.mcpUsageDesc')} right={<Toggle checked={showMcpUsage} onChange={setShowMcpUsage} />} />
        </div>
      </section>

      {/* Session Sort */}
      <section>
        <h3 className="text-base font-semibold mb-1">{t('settings.sort.title')}</h3>
        <p className="text-xs text-[#808080] mb-3">{t('settings.sort.desc')}</p>
        <div className="flex flex-wrap gap-3">
          <div>
            <span className="text-xs text-[#808080] mb-1.5 block">{t('settings.sort.sortBy')}</span>
            <div className="flex bg-[#2a2a2a] rounded-lg p-1">
              {sortFieldKeys.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSessionSortField(opt.value)}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                    sessionSortField === opt.value
                      ? 'bg-[#3b82f6] text-white shadow-md shadow-blue-500/20'
                      : 'text-[#a0a0a0] hover:text-white'
                  )}
                >
                  {t(opt.key)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="text-xs text-[#808080] mb-1.5 block">{t('settings.sort.order')}</span>
            <div className="flex bg-[#2a2a2a] rounded-lg p-1">
              <button
                onClick={() => setSessionSortOrder('desc')}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                  sessionSortOrder === 'desc'
                    ? 'bg-[#3b82f6] text-white shadow-md shadow-blue-500/20'
                    : 'text-[#a0a0a0] hover:text-white'
                )}
              >
                {t('settings.sort.desc_order')}
              </button>
              <button
                onClick={() => setSessionSortOrder('asc')}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                  sessionSortOrder === 'asc'
                    ? 'bg-[#3b82f6] text-white shadow-md shadow-blue-500/20'
                    : 'text-[#a0a0a0] hover:text-white'
                )}
              >
                {t('settings.sort.asc_order')}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Auto-Refresh */}
      <section>
        <h3 className="text-base font-semibold mb-1">{t('settings.autoRefresh.title')}</h3>
        <p className="text-xs text-[#808080] mb-3">{t('settings.autoRefresh.desc')}</p>
        <div className="space-y-3">
          <SettingItem
            icon={<RefreshCw className="w-5 h-5" />}
            iconColor="#f59e0b"
            title={t('settings.autoRefresh.enable')}
            description={t('settings.autoRefresh.enableDesc')}
            right={<Toggle checked={autoRefreshEnabled} onChange={setAutoRefreshEnabled} />}
          />
          {autoRefreshEnabled && (
            <div className="ml-14 flex items-center gap-3">
              <span className="text-sm text-[#808080]">{t('settings.autoRefresh.interval')}</span>
              <div className="flex bg-[#2a2a2a] rounded-lg p-1">
                {intervalKeys.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setAutoRefreshInterval(opt.value)}
                    className={cn(
                      'px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                      autoRefreshInterval === opt.value
                        ? 'bg-[#3b82f6] text-white shadow-md shadow-blue-500/20'
                        : 'text-[#a0a0a0] hover:text-white'
                    )}
                  >
                    {t(opt.key)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

const SOURCE_ITEMS: {
  key: 'claude_code' | 'codex' | 'gemini' | 'opencode' | 'openclaw';
  labelKey: string;
  path: string;
  color: string;
}[] = [
  { key: 'claude_code', labelKey: 'settings.dataSource.claudeCode', path: '~/.claude/projects/', color: '#3b82f6' },
  { key: 'codex', labelKey: 'settings.dataSource.codex', path: '~/.codex/', color: '#22c55e' },
  { key: 'gemini', labelKey: 'settings.dataSource.gemini', path: '~/.gemini/', color: '#f59e0b' },
  { key: 'opencode', labelKey: 'settings.dataSource.opencode', path: '~/.local/share/opencode/', color: '#a855f7' },
  { key: 'openclaw', labelKey: 'settings.dataSource.openclaw', path: '~/.openclaw/', color: '#06b6d4' },
];

function DataSourceList() {
  const { t } = useTranslation();
  const { enabledSources, toggleSource } = useSettingsStore();
  const { data: detected } = useDetectSources();

  const detectedMap = new Map(detected ?? []);

  return (
    <div className="space-y-2">
      {SOURCE_ITEMS.map((item) => {
        const isDetected = detectedMap.get(item.key) ?? false;
        const isEnabled = enabledSources[item.key];

        return (
          <div
            key={item.key}
            className="flex items-center gap-3 bg-[#222] rounded-lg px-3 py-2.5"
          >
            <div
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: isDetected ? item.color : '#333' }}
              title={isDetected ? t('settings.dataSource.detected') : t('settings.dataSource.notDetected')}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{t(item.labelKey)}</span>
                {!isDetected && (
                  <span className="text-[10px] text-[#606060] uppercase tracking-wider">
                    {t('settings.dataSource.notDetected')}
                  </span>
                )}
              </div>
              <code className="text-xs text-[#606060] font-mono">{item.path}</code>
            </div>
            <Toggle checked={isEnabled} onChange={() => toggleSource(item.key)} />
          </div>
        );
      })}
    </div>
  );
}

function AdvancedTab() {
  const { t } = useTranslation();
  const {
    customPricingEnabled,
    customPricing,
    customPricingModels,
    customProviders,
    setCustomPricingEnabled,
    updateModelPricing,
    addCustomProvider,
    removeCustomProvider,
    resetSettings,
  } = useSettingsStore();
  const {
    models: pricingModels,
    lastFetched,
    expiresAt,
    stale,
    isFetching,
    error: pricingError,
    refreshPricing,
  } =
    usePricingStore();
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [newProviderName, setNewProviderName] = useState('');
  const [newProviderKeyword, setNewProviderKeyword] = useState('');
  const [newPricingModel, setNewPricingModel] = useState('');
  const { data: presetModels } = usePresetModels();

  // Auto-load preset models on first use (when customPricingModels is empty)
  useEffect(() => {
    if (presetModels && presetModels.length > 0 && customPricingModels.length === 0) {
      useSettingsStore.setState({ customPricingModels: presetModels });
    }
  }, [presetModels, customPricingModels.length]);

  const handleRefreshPricing = () => {
    void refreshPricing();
  };

  const handleAddPricing = () => {
    const model = newPricingModel.trim();
    if (!model || customPricingModels.includes(model)) return;
    // Add to model list
    useSettingsStore.setState((s) => ({
      customPricingModels: [...s.customPricingModels, model],
    }));
    setNewPricingModel('');
  };

  const handleRemovePricing = (model: string) => {
    const updated = { ...customPricing };
    delete updated[model];
    useSettingsStore.setState((s) => ({
      customPricing: updated,
      customPricingModels: s.customPricingModels.filter((m) => m !== model),
    }));
  };

  const handleAddProvider = () => {
    const name = newProviderName.trim();
    const keyword = newProviderKeyword.trim().toLowerCase();
    if (!name || !keyword) return;
    if (customProviders.some((cp) => cp.keyword.toLowerCase() === keyword)) return;
    addCustomProvider({ name, keyword });
    setNewProviderName('');
    setNewProviderKeyword('');
  };

  return (
    <div className="space-y-4">
      {/* Dynamic Pricing Status */}
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#22c55e]/20 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-[#22c55e]" />
            </div>
            <div>
              <div className="text-sm font-medium">{t('settings.pricing.dynamic')}</div>
              <div className="text-xs text-[#808080] mt-0.5">
                {pricingModels.length > 0 ? (
                  <>
                    {pricingModels.length} {t('settings.pricing.models')}
                    {lastFetched && (
                      <span className="ml-2">
                        · {t('settings.pricing.updated')}{' '}
                        {new Date(lastFetched).toLocaleString()}
                      </span>
                    )}
                    {expiresAt && (
                      <span className="ml-2">
                        · Expires {new Date(expiresAt).toLocaleString()}
                      </span>
                    )}
                    {stale && <span className="ml-2 text-amber-400">· stale</span>}
                  </>
                ) : pricingError ? (
                  <span className="text-[#ef4444]">{pricingError}</span>
                ) : (
                  t('settings.pricing.notFetched')
                )}
              </div>
              {pricingModels.length > 0 && pricingError && (
                <div className="text-xs text-[#ef4444] mt-1">{pricingError}</div>
              )}
            </div>
          </div>
          <button
            onClick={handleRefreshPricing}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2a2a2a] text-[#a0a0a0] rounded-lg text-xs font-medium hover:bg-[#333] hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isFetching && 'animate-spin')} />
            {isFetching ? t('settings.pricing.fetching') : t('settings.pricing.refresh')}
          </button>
        </div>
        <p className="text-xs text-[#606060] mt-2">{t('settings.pricing.dynamicDesc')}</p>
      </div>

      {/* Custom Pricing Override */}
      <ExpandableSection
        icon={<FlaskConical className="w-5 h-5" />}
        iconColor="#f59e0b"
        title={t('settings.pricing.customTitle')}
        description={t('settings.pricing.customDesc')}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">{t('settings.pricing.enableCustom')}</div>
              <div className="text-xs text-[#808080] mt-0.5">{t('settings.pricing.disabledNote')}</div>
            </div>
            <Toggle checked={customPricingEnabled} onChange={setCustomPricingEnabled} />
          </div>

          {customPricingEnabled && (
            <div className="space-y-4 pt-2 border-t border-[#2a2a2a]">
              <p className="text-xs text-[#606060]">{t('settings.pricing.unit')}</p>

              {/* Add new model pricing */}
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="text-xs text-[#808080] mb-1 block">{t('sessions.model')}</label>
                  <input
                    type="text"
                    placeholder="e.g., claude-opus-4-6"
                    value={newPricingModel}
                    onChange={(e) => setNewPricingModel(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddPricing()}
                    className="w-full bg-[#2a2a2a] border border-[#333] rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#3b82f6] placeholder-[#555] transition-colors"
                  />
                </div>
                <button
                  onClick={handleAddPricing}
                  disabled={!newPricingModel.trim()}
                  className="flex items-center gap-1.5 px-3 py-2 bg-[#3b82f6] text-white rounded-md text-sm font-medium hover:bg-[#2563eb] transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  {t('settings.customProviders.add')}
                </button>
              </div>

              {/* Model pricing list — from presets + user-added */}
              {customPricingModels.length > 0 && (
                <div className="space-y-3 pt-2 border-t border-[#2a2a2a]">
                  {customPricingModels.map((modelName) => {
                    // User override > OpenRouter dynamic > zeros
                    const userOverride = customPricing[modelName];
                    const dynamic = usePricingStore.getState().getPricingForModel(modelName);
                    const p = userOverride || (dynamic ? {
                      input: dynamic.input, output: dynamic.output,
                      cacheRead: dynamic.cacheRead, cacheCreation: dynamic.cacheWrite,
                    } : { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 });
                    const isFromApi = !userOverride && !!dynamic;

                    return (
                      <div key={modelName} className="bg-[#222] rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-white font-mono">{modelName}</span>
                            {isFromApi && (
                              <span className="text-[10px] text-[#22c55e] bg-[#22c55e]/10 px-1.5 py-0.5 rounded">API</span>
                            )}
                            {userOverride && (
                              <span className="text-[10px] text-[#f59e0b] bg-[#f59e0b]/10 px-1.5 py-0.5 rounded">{t('settings.customRanges.custom')}</span>
                            )}
                          </div>
                          <button
                            onClick={() => handleRemovePricing(modelName)}
                            className="p-1 rounded hover:bg-[#333] text-[#808080] hover:text-red-400 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-[#808080]">Input</span>
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-[#606060]">$</span>
                              <input type="number" value={p.input} onChange={(e) => updateModelPricing(modelName, { input: parseFloat(e.target.value) || 0 })} step="0.01" min="0" className="w-20 bg-[#2a2a2a] border border-[#333] rounded-md px-2 py-1 text-xs text-right focus:outline-none focus:border-[#3b82f6] font-mono" />
                              <span className="text-xs text-[#606060]">/M</span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-[#808080]">Output</span>
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-[#606060]">$</span>
                              <input type="number" value={p.output} onChange={(e) => updateModelPricing(modelName, { output: parseFloat(e.target.value) || 0 })} step="0.01" min="0" className="w-20 bg-[#2a2a2a] border border-[#333] rounded-md px-2 py-1 text-xs text-right focus:outline-none focus:border-[#3b82f6] font-mono" />
                              <span className="text-xs text-[#606060]">/M</span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-[#808080]">{t('settings.pricing.cacheRead')}</span>
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-[#606060]">$</span>
                              <input type="number" value={p.cacheRead} onChange={(e) => updateModelPricing(modelName, { cacheRead: parseFloat(e.target.value) || 0 })} step="0.01" min="0" className="w-20 bg-[#2a2a2a] border border-[#333] rounded-md px-2 py-1 text-xs text-right focus:outline-none focus:border-[#3b82f6] font-mono" />
                              <span className="text-xs text-[#606060]">/M</span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-[#808080]">{t('settings.pricing.cacheWrite')}</span>
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-[#606060]">$</span>
                              <input type="number" value={p.cacheCreation} onChange={(e) => updateModelPricing(modelName, { cacheCreation: parseFloat(e.target.value) || 0 })} step="0.01" min="0" className="w-20 bg-[#2a2a2a] border border-[#333] rounded-md px-2 py-1 text-xs text-right focus:outline-none focus:border-[#3b82f6] font-mono" />
                              <span className="text-xs text-[#606060]">/M</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </ExpandableSection>

      {/* Custom Providers */}
      <ExpandableSection
        icon={<Layers className="w-5 h-5" />}
        iconColor="#8b5cf6"
        title={t('settings.customProviders.title')}
        description={t('settings.customProviders.desc')}
      >
        <div className="space-y-4">
          {/* Add form */}
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="text-xs text-[#808080] mb-1 block">
                {t('settings.customProviders.name')}
              </label>
              <input
                type="text"
                placeholder="e.g., Fireworks AI"
                value={newProviderName}
                onChange={(e) => setNewProviderName(e.target.value)}
                className="w-full bg-[#2a2a2a] border border-[#333] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#3b82f6] placeholder-[#555] transition-colors"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-[#808080] mb-1 block">
                {t('settings.customProviders.keyword')}
              </label>
              <input
                type="text"
                placeholder="e.g., fireworks"
                value={newProviderKeyword}
                onChange={(e) => setNewProviderKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddProvider()}
                className="w-full bg-[#2a2a2a] border border-[#333] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#3b82f6] placeholder-[#555] transition-colors"
              />
            </div>
            <button
              onClick={handleAddProvider}
              disabled={!newProviderName.trim() || !newProviderKeyword.trim()}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#3b82f6] text-white rounded-md text-sm font-medium hover:bg-[#2563eb] transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              <Plus className="w-4 h-4" />
              {t('settings.customProviders.add')}
            </button>
          </div>

          {/* Existing custom providers list */}
          {customProviders.length > 0 && (
            <div className="space-y-2 pt-3 border-t border-[#2a2a2a]">
              {customProviders.map((cp, index) => (
                <div
                  key={`${cp.keyword}-${index}`}
                  className="flex items-center justify-between bg-[#222] rounded-lg px-3 py-2.5"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">{cp.name}</span>
                    <span className="text-xs text-[#808080] bg-[#2a2a2a] px-2 py-0.5 rounded">
                      {t('settings.customProviders.keywordPrefix')}: {cp.keyword}
                    </span>
                  </div>
                  <button
                    onClick={() => removeCustomProvider(index)}
                    className="p-1 rounded hover:bg-[#333] text-[#808080] hover:text-red-400 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Help text */}
          <p className="text-xs text-[#606060]">
            {t('settings.customProviders.help')}
          </p>
        </div>
      </ExpandableSection>

      {/* Data Source */}
      <ExpandableSection
        icon={<FolderOpen className="w-5 h-5" />}
        iconColor="#3b82f6"
        title={t('settings.dataSource.title')}
        description={t('settings.dataSource.desc')}
      >
        <DataSourceList />
      </ExpandableSection>

      {/* Data Management */}
      <ExpandableSection
        icon={<Database className="w-5 h-5" />}
        iconColor="#06b6d4"
        title={t('settings.dataManagement.title')}
        description={t('settings.dataManagement.desc')}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">{t('settings.dataManagement.resetAll')}</div>
              <div className="text-xs text-[#808080] mt-0.5">{t('settings.dataManagement.resetDesc')}</div>
            </div>
            {showResetConfirm ? (
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    resetSettings();
                    setShowResetConfirm(false);
                  }}
                  className="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-xs font-medium hover:bg-red-500/30 transition-colors"
                >
                  {t('common.confirm')}
                </button>
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="px-3 py-1.5 bg-[#2a2a2a] text-[#a0a0a0] rounded-lg text-xs font-medium hover:bg-[#333] transition-colors"
                >
                  {t('common.cancel')}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowResetConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2a2a2a] text-[#a0a0a0] rounded-lg text-xs font-medium hover:bg-[#333] hover:text-white transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {t('common.reset')}
              </button>
            )}
          </div>
        </div>
      </ExpandableSection>
    </div>
  );
}

function AboutTab() {
  const { t } = useTranslation();
  const { status: updateStatus, checkForUpdate, setDialogOpen, currentVersion, error: updateError } = useUpdateStore();
  const [appVersion, setAppVersion] = useState('');

  useEffect(() => {
    getVersion().then(setAppVersion);
  }, []);

  const version = currentVersion || appVersion;

  const handleCheckUpdate = async () => {
    await checkForUpdate();
    const { status } = useUpdateStore.getState();
    if (status === 'available' || status === 'downloaded') {
      setDialogOpen(true);
    }
  };

  return (
    <div className="space-y-6">
      {/* App Info Card */}
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6 text-center">
        <div className="w-16 h-16 mx-auto bg-gradient-to-br from-[#3b82f6] to-[#6366f1] rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20 mb-4">
          <span className="text-white font-bold text-3xl">C</span>
        </div>
        <h2 className="text-xl font-bold mb-1">CC Statistics</h2>
        <p className="text-sm text-[#808080]">v{version || '...'}</p>
        <div className="mt-3">
          {updateStatus === 'available' || updateStatus === 'downloaded' ? (
            <button
              onClick={() => setDialogOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#3b82f6] text-sm font-medium text-white hover:bg-[#2563eb] transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              {updateStatus === 'downloaded' ? t('update.restartToUpdate') : t('update.updateAvailable')}
            </button>
          ) : (
            <button
              onClick={handleCheckUpdate}
              disabled={updateStatus === 'checking'}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2a2a2a] border border-[#333] text-sm font-medium text-[#a0a0a0] hover:text-white hover:border-[#444] transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn('w-4 h-4', updateStatus === 'checking' && 'animate-spin')} />
              {updateStatus === 'checking' ? t('update.checking') : t('update.checkForUpdates')}
            </button>
          )}
          {updateStatus === 'idle' && currentVersion && (
            <p className="text-xs text-[#606060] mt-2">{t('update.upToDate')}</p>
          )}
          {updateStatus === 'error' && updateError && (
            <p className="text-xs text-red-400 mt-2">{updateError}</p>
          )}
        </div>
        <p className="text-xs text-[#606060] mt-3 max-w-sm mx-auto">{t('about.appDesc')}</p>
      </div>

      {/* Details */}
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-5">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#3b82f6]/10 flex items-center justify-center">
                <Info className="w-4 h-4 text-[#3b82f6]" />
              </div>
              <span className="text-sm text-[#a0a0a0]">{t('about.appName')}</span>
            </div>
            <span className="text-sm font-medium">CC Statistics</span>
          </div>
          <div className="border-t border-[#2a2a2a]" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#22c55e]/10 flex items-center justify-center">
                <Wrench className="w-4 h-4 text-[#22c55e]" />
              </div>
              <span className="text-sm text-[#a0a0a0]">{t('about.techStack')}</span>
            </div>
            <span className="text-sm font-medium">Tauri + React + TypeScript</span>
          </div>
          <div className="border-t border-[#2a2a2a]" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#a855f7]/10 flex items-center justify-center">
                <Database className="w-4 h-4 text-[#a855f7]" />
              </div>
              <span className="text-sm text-[#a0a0a0]">{t('about.dataStorage')}</span>
            </div>
            <span className="text-sm font-medium">{t('about.localOnly')}</span>
          </div>
          <div className="border-t border-[#2a2a2a]" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#f59e0b]/10 flex items-center justify-center">
                <Shield className="w-4 h-4 text-[#f59e0b]" />
              </div>
              <span className="text-sm text-[#a0a0a0]">{t('about.privacy')}</span>
            </div>
            <span className="text-sm font-medium text-[#22c55e]">{t('about.allDataLocal')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  const tabs: { label: string; value: SettingsTab }[] = [
    { label: t('settings.tabs.general'), value: 'general' },
    { label: t('settings.tabs.advanced'), value: 'advanced' },
    { label: t('settings.tabs.about'), value: 'about' },
  ];

  return (
    <div className="flex-1 p-6 overflow-auto">
      <div className="max-w-3xl mx-auto">
        {/* Tab Bar */}
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-1 mb-6 flex">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={cn(
                'flex-1 px-6 py-2.5 rounded-lg text-sm font-medium transition-all',
                activeTab === tab.value
                  ? 'bg-[#3b82f6] text-white shadow-md shadow-blue-500/20'
                  : 'text-[#a0a0a0] hover:text-white'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'general' && <GeneralTab />}
        {activeTab === 'advanced' && <AdvancedTab />}
        {activeTab === 'about' && <AboutTab />}
      </div>
    </div>
  );
}
