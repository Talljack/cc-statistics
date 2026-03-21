import { useState, useEffect } from 'react';
import {
  useSettingsStore,
  providerGroups,
  type Language,
  type Theme,
  type SessionSortField,
  type CustomPricing,
} from '../../stores/settingsStore';
import { usePricingStore } from '../../stores/pricingStore';
import { useUpdateStore } from '../../stores/updateStore';
import { getVersion } from '@tauri-apps/api/app';
import { cn } from '../../lib/utils';
import type { TimeFilter } from '../../types/statistics';
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
} from 'lucide-react';

type SettingsTab = 'general' | 'advanced' | 'about';

const tabs: { label: string; value: SettingsTab }[] = [
  { label: '通用', value: 'general' },
  { label: '高级', value: 'advanced' },
  { label: '关于', value: 'about' },
];

const languages: { label: string; value: Language }[] = [
  { label: '中文', value: 'zh' },
  { label: 'English', value: 'en' },
  { label: '日本語', value: 'ja' },
];

const themes: { label: string; value: Theme; icon: React.ReactNode }[] = [
  { label: '浅色', value: 'light', icon: <Sun className="w-4 h-4" /> },
  { label: '深色', value: 'dark', icon: <Moon className="w-4 h-4" /> },
  { label: '跟随系统', value: 'system', icon: <Monitor className="w-4 h-4" /> },
];

const intervalOptions = [
  { label: '1 分钟', value: 1 },
  { label: '5 分钟', value: 5 },
  { label: '10 分钟', value: 10 },
  { label: '30 分钟', value: 30 },
];

const timeFilterOptions: { label: string; value: TimeFilter }[] = [
  { label: 'Today', value: 'today' },
  { label: 'Week', value: 'week' },
  { label: 'Month', value: 'month' },
  { label: 'All', value: 'all' },
];

const sortFieldOptions: { zh: string; en: string; ja: string; value: SessionSortField }[] = [
  { zh: '时间', en: 'Time', ja: '時間', value: 'timestamp' },
  { zh: '费用', en: 'Cost', ja: '費用', value: 'cost_usd' },
  { zh: 'Token 量', en: 'Tokens', ja: 'トークン', value: 'total_tokens' },
  { zh: '时长', en: 'Duration', ja: '長さ', value: 'duration_ms' },
];

// i18n helper
const t = (zh: string, en: string, ja: string, lang: Language) => {
  if (lang === 'en') return en;
  if (lang === 'ja') return ja;
  return zh;
};

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

function PricingInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-[#808080]">{label}</span>
      <div className="flex items-center gap-1">
        <span className="text-xs text-[#606060]">$</span>
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          step="0.01"
          min="0"
          className="w-20 bg-[#2a2a2a] border border-[#333] rounded-md px-2 py-1 text-xs text-right focus:outline-none focus:border-[#3b82f6] font-mono"
        />
        <span className="text-xs text-[#606060]">/M</span>
      </div>
    </div>
  );
}

function GeneralTab() {
  const {
    language,
    theme,
    defaultTimeFilter,
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
    setDefaultTimeFilter,
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

  return (
    <div className="space-y-6">
      {/* Language */}
      <section>
        <h3 className="text-base font-semibold mb-1">
          {t('界面语言', 'Interface Language', 'インターフェース言語', language)}
        </h3>
        <p className="text-xs text-[#808080] mb-3">
          {t(
            '切换后立即预览界面语言，保存后永久生效。',
            'Switch to preview immediately. Persisted after save.',
            '切り替え後すぐにプレビューされます。',
            language
          )}
        </p>
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
        <h3 className="text-base font-semibold mb-1">
          {t('外观主题', 'Appearance', 'テーマ', language)}
        </h3>
        <p className="text-xs text-[#808080] mb-3">
          {t(
            '选择应用的外观主题，立即生效。',
            'Choose the app appearance. Takes effect immediately.',
            'アプリの外観テーマを選択します。',
            language
          )}
        </p>
        <div className="flex bg-[#2a2a2a] rounded-lg p-1 w-fit">
          {themes.map((th) => (
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

      {/* Default Time Filter */}
      <section>
        <h3 className="text-base font-semibold mb-1">
          {t('默认时间范围', 'Default Time Range', 'デフォルト時間範囲', language)}
        </h3>
        <p className="text-xs text-[#808080] mb-3">
          {t(
            '应用启动时默认显示的时间范围。',
            'The time range shown when the app starts.',
            'アプリ起動時に表示するデフォルトの時間範囲。',
            language
          )}
        </p>
        <div className="flex bg-[#2a2a2a] rounded-lg p-1 w-fit">
          {timeFilterOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDefaultTimeFilter(opt.value)}
              className={cn(
                'px-4 py-2 rounded-md text-sm font-medium transition-all',
                defaultTimeFilter === opt.value
                  ? 'bg-[#3b82f6] text-white shadow-md shadow-blue-500/20'
                  : 'text-[#a0a0a0] hover:text-white'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      {/* Cost Display */}
      <section>
        <h3 className="text-base font-semibold mb-1">
          {t('费用显示', 'Cost Display', '費用表示', language)}
        </h3>
        <p className="text-xs text-[#808080] mb-3">
          {t(
            '控制是否在应用中显示费用相关信息。',
            'Control whether cost information is shown in the app.',
            'アプリ内で費用情報を表示するかどうかを制御します。',
            language
          )}
        </p>
        <SettingItem
          icon={<DollarSign className="w-5 h-5" />}
          iconColor="#ef4444"
          title={t('显示费用统计', 'Show Cost Statistics', '費用統計を表示', language)}
          description={t(
            '在仪表盘和会话列表中显示费用信息',
            'Show cost info in dashboard and sessions list',
            'ダッシュボードとセッション一覧に費用を表示',
            language
          )}
          right={<Toggle checked={showCost} onChange={setShowCost} />}
        />
      </section>

      {/* Dashboard Cards */}
      <section>
        <h3 className="text-base font-semibold mb-1">
          {t('仪表盘卡片', 'Dashboard Cards', 'ダッシュボードカード', language)}
        </h3>
        <p className="text-xs text-[#808080] mb-3">
          {t(
            '选择在仪表盘顶部显示的统计卡片。',
            'Choose which stat cards to display at the top of the dashboard.',
            'ダッシュボード上部に表示する統計カードを選択します。',
            language
          )}
        </p>
        <div className="space-y-3">
          <SettingItem
            icon={<MessageSquare className="w-5 h-5" />}
            iconColor="#3b82f6"
            title="Sessions"
            description={t('会话数量统计', 'Session count', 'セッション数', language)}
            right={<Toggle checked={showSessionsCard} onChange={setShowSessionsCard} />}
          />
          <SettingItem
            icon={<FileText className="w-5 h-5" />}
            iconColor="#22c55e"
            title="Instructions"
            description={t('指令数量统计', 'Instruction count', '指示数', language)}
            right={<Toggle checked={showInstructionsCard} onChange={setShowInstructionsCard} />}
          />
          <SettingItem
            icon={<Clock className="w-5 h-5" />}
            iconColor="#a855f7"
            title="Duration"
            description={t('AI 处理时长', 'AI processing duration', 'AI処理時間', language)}
            right={<Toggle checked={showDurationCard} onChange={setShowDurationCard} />}
          />
          <SettingItem
            icon={<Cpu className="w-5 h-5" />}
            iconColor="#f59e0b"
            title="Tokens"
            description={t('Token 使用量', 'Token usage', 'トークン使用量', language)}
            right={<Toggle checked={showTokensCard} onChange={setShowTokensCard} />}
          />
          {showCost && (
            <SettingItem
              icon={<DollarSign className="w-5 h-5" />}
              iconColor="#ef4444"
              title="Cost"
              description={t('预估费用统计', 'Estimated cost', '推定費用', language)}
              right={<Toggle checked={showCostCard} onChange={setShowCostCard} />}
            />
          )}
          <SettingItem
            icon={<Zap className="w-5 h-5" />}
            iconColor="#22c55e"
            title="Skills"
            description={t('Skill 调用次数', 'Skill call count', 'スキル呼び出し数', language)}
            right={<Toggle checked={showSkillsCard} onChange={setShowSkillsCard} />}
          />
          <SettingItem
            icon={<Plug className="w-5 h-5" />}
            iconColor="#06b6d4"
            title="MCP"
            description={t('MCP 调用次数', 'MCP call count', 'MCP呼び出し数', language)}
            right={<Toggle checked={showMcpCard} onChange={setShowMcpCard} />}
          />
        </div>
      </section>

      {/* Dashboard Chart Display */}
      <section>
        <h3 className="text-base font-semibold mb-1">
          {t('图表模块', 'Chart Modules', 'チャートモジュール', language)}
        </h3>
        <p className="text-xs text-[#808080] mb-3">
          {t(
            '选择在主页面显示的图表模块。',
            'Choose which chart modules to display on the dashboard.',
            'ダッシュボードに表示するチャートを選択します。',
            language
          )}
        </p>
        <div className="space-y-3">
          <SettingItem
            icon={<Wrench className="w-5 h-5" />}
            iconColor="#3b82f6"
            title={t('工具使用统计', 'Tool Usage', 'ツール使用統計', language)}
            description={t(
              '显示 Claude 工具调用频率统计',
              'Show tool call frequency statistics',
              'ツール呼び出し頻度を表示',
              language
            )}
            right={<Toggle checked={showToolUsage} onChange={setShowToolUsage} />}
          />
          <SettingItem
            icon={<Zap className="w-5 h-5" />}
            iconColor="#22c55e"
            title={t('技能使用统计', 'Skill Usage', 'スキル使用統計', language)}
            description={t(
              '显示 Skill 调用频率统计',
              'Show skill call frequency statistics',
              'スキル呼び出し頻度を表示',
              language
            )}
            right={<Toggle checked={showSkillUsage} onChange={setShowSkillUsage} />}
          />
          <SettingItem
            icon={<Plug className="w-5 h-5" />}
            iconColor="#a855f7"
            title={t('MCP 使用统计', 'MCP Usage', 'MCP 使用統計', language)}
            description={t(
              '显示 MCP 服务器调用频率统计',
              'Show MCP server call frequency statistics',
              'MCPサーバー呼び出し頻度を表示',
              language
            )}
            right={<Toggle checked={showMcpUsage} onChange={setShowMcpUsage} />}
          />
        </div>
      </section>

      {/* Session Sort */}
      <section>
        <h3 className="text-base font-semibold mb-1">
          {t('会话排序', 'Session Sort', 'セッションソート', language)}
        </h3>
        <p className="text-xs text-[#808080] mb-3">
          {t(
            '会话列表的默认排序方式。',
            'Default sorting for the sessions list.',
            'セッション一覧のデフォルトソート。',
            language
          )}
        </p>
        <div className="flex flex-wrap gap-3">
          <div>
            <span className="text-xs text-[#808080] mb-1.5 block">
              {t('排序字段', 'Sort by', 'ソートフィールド', language)}
            </span>
            <div className="flex bg-[#2a2a2a] rounded-lg p-1">
              {sortFieldOptions.map((opt) => (
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
                  {t(opt.zh, opt.en, opt.ja, language)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="text-xs text-[#808080] mb-1.5 block">
              {t('排序方向', 'Order', 'ソート方向', language)}
            </span>
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
                {t('降序', 'Desc', '降順', language)}
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
                {t('升序', 'Asc', '昇順', language)}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Auto-Refresh */}
      <section>
        <h3 className="text-base font-semibold mb-1">
          {t('自动刷新', 'Auto Refresh', '自動更新', language)}
        </h3>
        <p className="text-xs text-[#808080] mb-3">
          {t(
            '开启后将按设定间隔自动刷新数据。',
            'When enabled, data will refresh automatically at the set interval.',
            '有効にすると、設定した間隔で自動的にデータを更新します。',
            language
          )}
        </p>
        <div className="space-y-3">
          <SettingItem
            icon={<RefreshCw className="w-5 h-5" />}
            iconColor="#f59e0b"
            title={t('启用自动刷新', 'Enable Auto Refresh', '自動更新を有効にする', language)}
            description={t(
              '定时自动刷新统计数据',
              'Automatically refresh statistics at intervals',
              '定期的にデータを自動更新',
              language
            )}
            right={<Toggle checked={autoRefreshEnabled} onChange={setAutoRefreshEnabled} />}
          />
          {autoRefreshEnabled && (
            <div className="ml-14 flex items-center gap-3">
              <span className="text-sm text-[#808080]">
                {t('刷新间隔', 'Interval', '更新間隔', language)}
              </span>
              <div className="flex bg-[#2a2a2a] rounded-lg p-1">
                {intervalOptions.map((opt) => (
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
                    {opt.label}
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

function ModelPricingSection({
  label,
  model,
  pricing,
  language,
}: {
  label: string;
  model: keyof CustomPricing;
  pricing: CustomPricing;
  language: Language;
}) {
  const { updateModelPricing } = useSettingsStore();
  const p = pricing[model];

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-white">{label}</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 pl-2">
        <PricingInput
          label="Input"
          value={p.input}
          onChange={(v) => updateModelPricing(model, { input: v })}
        />
        <PricingInput
          label="Output"
          value={p.output}
          onChange={(v) => updateModelPricing(model, { output: v })}
        />
        <PricingInput
          label={t('Cache Read', 'Cache Read', 'キャッシュ読取', language)}
          value={p.cacheRead}
          onChange={(v) => updateModelPricing(model, { cacheRead: v })}
        />
        <PricingInput
          label={t('Cache Write', 'Cache Write', 'キャッシュ書込', language)}
          value={p.cacheCreation}
          onChange={(v) => updateModelPricing(model, { cacheCreation: v })}
        />
      </div>
    </div>
  );
}

function AdvancedTab() {
  const { language, customPricingEnabled, customPricing, setCustomPricingEnabled, resetSettings } =
    useSettingsStore();
  const { models: pricingModels, lastFetched, isFetching, error: pricingError, fetchPricing } =
    usePricingStore();
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handleRefreshPricing = () => {
    // Force refetch by clearing lastFetched
    usePricingStore.setState({ lastFetched: null });
    fetchPricing();
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
              <div className="text-sm font-medium">
                {t('动态定价数据', 'Dynamic Pricing Data', '動的価格データ', language)}
              </div>
              <div className="text-xs text-[#808080] mt-0.5">
                {pricingModels.length > 0 ? (
                  <>
                    {pricingModels.length} {t('个模型', 'models', 'モデル', language)}
                    {lastFetched && (
                      <span className="ml-2">
                        · {t('更新于', 'Updated', '更新', language)}{' '}
                        {new Date(lastFetched).toLocaleString()}
                      </span>
                    )}
                  </>
                ) : pricingError ? (
                  <span className="text-[#ef4444]">{pricingError}</span>
                ) : (
                  t('未获取', 'Not fetched', '未取得', language)
                )}
              </div>
            </div>
          </div>
          <button
            onClick={handleRefreshPricing}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2a2a2a] text-[#a0a0a0] rounded-lg text-xs font-medium hover:bg-[#333] hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isFetching && 'animate-spin')} />
            {isFetching
              ? t('获取中...', 'Fetching...', '取得中...', language)
              : t('刷新定价', 'Refresh', '更新', language)}
          </button>
        </div>
        <p className="text-xs text-[#606060] mt-2">
          {t(
            '从 OpenRouter API 自动获取最新模型定价，覆盖 100+ 模型。每 24 小时自动更新。',
            'Auto-fetches latest model pricing from OpenRouter API, covering 100+ models. Updates every 24 hours.',
            'OpenRouter API から最新のモデル価格を自動取得。24時間ごとに更新。',
            language
          )}
        </p>
      </div>

      {/* Custom Pricing Override */}
      <ExpandableSection
        icon={<FlaskConical className="w-5 h-5" />}
        iconColor="#f59e0b"
        title={t('自定义定价覆盖', 'Custom Pricing Override', 'カスタム価格オーバーライド', language)}
        description={t(
          '手动覆盖动态定价（优先级高于自动获取）',
          'Manually override dynamic pricing (takes priority over auto-fetched)',
          '動的価格を手動でオーバーライド（自動取得より優先）',
          language
        )}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">
                {t('启用自定义定价', 'Enable Custom Pricing', 'カスタム価格を有効にする', language)}
              </div>
              <div className="text-xs text-[#808080] mt-0.5">
                {t(
                  '关闭时使用各厂商官方定价',
                  'Uses official provider pricing when disabled',
                  '無効時は各プロバイダーの公式価格を使用',
                  language
                )}
              </div>
            </div>
            <Toggle checked={customPricingEnabled} onChange={setCustomPricingEnabled} />
          </div>

          {customPricingEnabled && (
            <div className="space-y-4 pt-2 border-t border-[#2a2a2a]">
              <p className="text-xs text-[#606060]">
                {t(
                  '价格单位：美元 / 百万 Token',
                  'Prices in USD per million tokens',
                  '価格単位: USD / 百万トークン',
                  language
                )}
              </p>
              {providerGroups.map((group, gi) => (
                <div key={group.provider || 'default'}>
                  {gi > 0 && <div className="border-t border-[#2a2a2a] my-3" />}
                  {group.provider && (
                    <div className="text-xs font-semibold text-[#3b82f6] uppercase tracking-wider mb-3">
                      {group.provider}
                    </div>
                  )}
                  {group.models.map((m) => (
                    <ModelPricingSection
                      key={m.key}
                      label={m.label}
                      model={m.key}
                      pricing={customPricing}
                      language={language}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </ExpandableSection>

      {/* Data Source */}
      <ExpandableSection
        icon={<FolderOpen className="w-5 h-5" />}
        iconColor="#3b82f6"
        title={t('数据源路径', 'Data Source Path', 'データソースパス', language)}
        description={t(
          '管理 Claude 会话数据的存储路径',
          'Manage the storage path for Claude session data',
          'Claude セッションデータの保存パスを管理',
          language
        )}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-[#a0a0a0]">
              {t('扫描路径', 'Scan Path', 'スキャンパス', language)}
            </span>
            <code className="text-sm bg-[#2a2a2a] px-3 py-1.5 rounded-lg text-[#a0a0a0] font-mono">
              ~/.claude/projects/
            </code>
          </div>
          <p className="text-xs text-[#606060]">
            {t(
              '当前仅支持默认路径，自定义路径将在后续版本支持。',
              'Currently only the default path is supported. Custom paths will be available in a future version.',
              '現在はデフォルトパスのみサポートしています。',
              language
            )}
          </p>
        </div>
      </ExpandableSection>

      {/* Data Management */}
      <ExpandableSection
        icon={<Database className="w-5 h-5" />}
        iconColor="#06b6d4"
        title={t('数据管理', 'Data Management', 'データ管理', language)}
        description={t(
          '管理本地缓存和应用设置',
          'Manage local cache and app settings',
          'ローカルキャッシュとアプリ設定を管理',
          language
        )}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">
                {t('重置所有设置', 'Reset All Settings', 'すべての設定をリセット', language)}
              </div>
              <div className="text-xs text-[#808080] mt-0.5">
                {t(
                  '将所有设置恢复为默认值（含定价）',
                  'Restore all settings to defaults (including pricing)',
                  'すべての設定をデフォルトに戻します（価格含む）',
                  language
                )}
              </div>
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
                  {t('确认重置', 'Confirm', '確認', language)}
                </button>
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="px-3 py-1.5 bg-[#2a2a2a] text-[#a0a0a0] rounded-lg text-xs font-medium hover:bg-[#333] transition-colors"
                >
                  {t('取消', 'Cancel', 'キャンセル', language)}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowResetConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2a2a2a] text-[#a0a0a0] rounded-lg text-xs font-medium hover:bg-[#333] hover:text-white transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {t('重置', 'Reset', 'リセット', language)}
              </button>
            )}
          </div>
        </div>
      </ExpandableSection>
    </div>
  );
}

function AboutTab() {
  const { language } = useSettingsStore();
  const { status: updateStatus, checkForUpdate, setDialogOpen, currentVersion } = useUpdateStore();
  const [appVersion, setAppVersion] = useState('');

  useEffect(() => {
    getVersion().then(setAppVersion);
  }, []);

  const version = currentVersion || appVersion;

  const checkUpdateLabel = language === 'en'
    ? 'Check for Updates'
    : language === 'ja'
    ? 'アップデートを確認'
    : '检查更新';

  const checkingLabel = language === 'en'
    ? 'Checking...'
    : language === 'ja'
    ? '確認中...'
    : '检查中...';

  const upToDateLabel = language === 'en'
    ? 'Up to date'
    : language === 'ja'
    ? '最新です'
    : '已是最新版本';

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
              {updateStatus === 'downloaded'
                ? (language === 'en' ? 'Restart to Update' : language === 'ja' ? '再起動して更新' : '重启以更新')
                : (language === 'en' ? 'Update Available' : language === 'ja' ? '更新あり' : '有可用更新')}
            </button>
          ) : (
            <button
              onClick={handleCheckUpdate}
              disabled={updateStatus === 'checking'}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2a2a2a] border border-[#333] text-sm font-medium text-[#a0a0a0] hover:text-white hover:border-[#444] transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn('w-4 h-4', updateStatus === 'checking' && 'animate-spin')} />
              {updateStatus === 'checking' ? checkingLabel : checkUpdateLabel}
            </button>
          )}
          {updateStatus === 'idle' && currentVersion && (
            <p className="text-xs text-[#606060] mt-2">{upToDateLabel}</p>
          )}
        </div>
        <p className="text-xs text-[#606060] mt-3 max-w-sm mx-auto">
          {t(
            '一个本地化的 Claude Code 使用统计分析工具。所有数据均在本地处理，不会上传到任何服务器。',
            'A local Claude Code usage statistics analyzer. All data is processed locally and never uploaded to any server.',
            'ローカルで動作する Claude Code 使用統計分析ツール。',
            language
          )}
        </p>
      </div>

      {/* Details */}
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-5">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#3b82f6]/10 flex items-center justify-center">
                <Info className="w-4 h-4 text-[#3b82f6]" />
              </div>
              <span className="text-sm text-[#a0a0a0]">
                {t('应用名称', 'Application', 'アプリケーション', language)}
              </span>
            </div>
            <span className="text-sm font-medium">CC Statistics</span>
          </div>
          <div className="border-t border-[#2a2a2a]" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#22c55e]/10 flex items-center justify-center">
                <Wrench className="w-4 h-4 text-[#22c55e]" />
              </div>
              <span className="text-sm text-[#a0a0a0]">
                {t('技术栈', 'Tech Stack', '技術スタック', language)}
              </span>
            </div>
            <span className="text-sm font-medium">Tauri + React + TypeScript</span>
          </div>
          <div className="border-t border-[#2a2a2a]" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#a855f7]/10 flex items-center justify-center">
                <Database className="w-4 h-4 text-[#a855f7]" />
              </div>
              <span className="text-sm text-[#a0a0a0]">
                {t('数据存储', 'Data Storage', 'データストレージ', language)}
              </span>
            </div>
            <span className="text-sm font-medium">
              {t('仅本地', 'Local Only', 'ローカルのみ', language)}
            </span>
          </div>
          <div className="border-t border-[#2a2a2a]" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#f59e0b]/10 flex items-center justify-center">
                <Shield className="w-4 h-4 text-[#f59e0b]" />
              </div>
              <span className="text-sm text-[#a0a0a0]">
                {t('隐私保护', 'Privacy', 'プライバシー', language)}
              </span>
            </div>
            <span className="text-sm font-medium text-[#22c55e]">
              {t('所有数据保留在本地', 'All data stays local', 'すべてのデータはローカルに保持', language)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

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
