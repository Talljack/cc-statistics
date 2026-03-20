import { useState } from 'react';
import { useSettingsStore, type Language, type Theme } from '../../stores/settingsStore';
import { cn } from '../../lib/utils';
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
}: {
  icon: React.ReactNode;
  iconColor: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);

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
  const {
    language,
    theme,
    showToolUsage,
    showSkillUsage,
    showMcpUsage,
    autoRefreshEnabled,
    autoRefreshInterval,
    setLanguage,
    setTheme,
    setShowToolUsage,
    setShowSkillUsage,
    setShowMcpUsage,
    setAutoRefreshEnabled,
    setAutoRefreshInterval,
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

      {/* Dashboard Display */}
      <section>
        <h3 className="text-base font-semibold mb-1">
          {t('主页面显示', 'Dashboard Display', 'ダッシュボード表示', language)}
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

function AdvancedTab() {
  const { language, resetSettings } = useSettingsStore();
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  return (
    <div className="space-y-4">
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
              '現在はデフォルトパスのみサポートしています。カスタムパスは将来のバージョンで利用可能になります。',
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
                  '将所有设置恢复为默认值',
                  'Restore all settings to their default values',
                  'すべての設定をデフォルト値に戻します',
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

  return (
    <div className="space-y-6">
      {/* App Info Card */}
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6 text-center">
        <div className="w-16 h-16 mx-auto bg-gradient-to-br from-[#3b82f6] to-[#6366f1] rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20 mb-4">
          <span className="text-white font-bold text-3xl">C</span>
        </div>
        <h2 className="text-xl font-bold mb-1">CC Statistics</h2>
        <p className="text-sm text-[#808080]">v1.0.0</p>
        <p className="text-xs text-[#606060] mt-3 max-w-sm mx-auto">
          {t(
            '一个本地化的 Claude Code 使用统计分析工具。所有数据均在本地处理，不会上传到任何服务器。',
            'A local Claude Code usage statistics analyzer. All data is processed locally and never uploaded to any server.',
            'ローカルで動作する Claude Code 使用統計分析ツール。すべてのデータはローカルで処理され、サーバーにアップロードされることはありません。',
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
