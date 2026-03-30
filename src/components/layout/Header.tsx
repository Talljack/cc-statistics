import { useFilterStore } from '../../stores/filterStore';
import { useAppStore } from '../../stores/appStore';
import { useProjects, useAvailableProviders } from '../../hooks/useStatistics';
import { useTranslation } from '../../lib/i18n';
import { cn } from '../../lib/utils';
import { ArrowLeft, ChevronDown, RefreshCw, Settings, BarChart3, ArrowDownCircle, Gauge } from 'lucide-react';
import { useUpdateStore } from '../../stores/updateStore';
import { HeaderTimeRangeControl } from '../time-ranges/HeaderTimeRangeControl';

interface HeaderProps {
  onRefresh: () => void;
  isRefreshing: boolean;
}

export function Header({ onRefresh, isRefreshing }: HeaderProps) {
  const { selectedProject, selectedProvider, setProject, setProvider } = useFilterStore();
  const { data: projects } = useProjects();
  const { data: providers } = useAvailableProviders();
  const { currentView, setView } = useAppStore();
  const { t } = useTranslation();
  const { status: updateStatus, setDialogOpen } = useUpdateStore();

  if (currentView === 'settings') {
    return (
      <header className="bg-[var(--color-bg-surface)] border-b border-[var(--color-border-base)] px-6 py-4 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setView('dashboard')}
            className="p-2 rounded-lg hover:bg-[var(--color-bg-hover)] transition-colors"
            title={t('common.back')}
          >
            <ArrowLeft className="w-5 h-5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors" />
          </button>
          <h1 className="text-lg font-semibold">{t('header.settings')}</h1>
        </div>
      </header>
    );
  }

  return (
    <header className="bg-[var(--color-bg-surface)] border-b border-[var(--color-border-base)] px-6 py-4 sticky top-0 z-50">
      <div className="flex flex-wrap items-center gap-4 xl:flex-nowrap xl:justify-between">
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-8 h-8 bg-gradient-to-br from-[var(--color-accent-blue)] to-[#6366f1] rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
            <span className="text-white font-bold text-lg">C</span>
          </div>
          <h1 className="text-lg font-semibold whitespace-nowrap">
            CC <span className="text-[var(--color-text-secondary)]">Statistics</span>
          </h1>
        </div>

        <div className="flex flex-1 min-w-0 flex-wrap items-center justify-end gap-3">
          <div className="relative flex-1 min-w-[180px] max-w-[400px]">
            <select
              value={selectedProject || ''}
              onChange={(e) => setProject(e.target.value || null)}
              className="w-full appearance-none bg-[var(--color-bg-hover)] border border-[var(--color-border-strong)] rounded-lg px-4 py-2 pr-10 text-sm focus:outline-none focus:border-[var(--color-accent-blue)] cursor-pointer transition-colors"
            >
              <option value="">{t('header.allProjects')}</option>
              {projects?.map((project) => (
                <option key={project.name} value={project.name}>
                  {project.name}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-[var(--color-text-secondary)]" />
          </div>

          {providers && providers.length > 1 && (
            <div className="relative min-w-[140px] max-w-[200px]">
              <select
                value={selectedProvider || ''}
                onChange={(e) => setProvider(e.target.value || null)}
                className="w-full appearance-none bg-[var(--color-bg-hover)] border border-[var(--color-border-strong)] rounded-lg px-4 py-2 pr-10 text-sm focus:outline-none focus:border-[var(--color-accent-blue)] cursor-pointer transition-colors"
              >
                <option value="">{t('header.allProviders')}</option>
                {providers.map((provider) => (
                  <option key={provider} value={provider}>
                    {provider}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-[var(--color-text-secondary)]" />
            </div>
          )}

          <HeaderTimeRangeControl />

          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-lg hover:bg-[var(--color-bg-hover)] transition-colors disabled:opacity-50"
            title={t('common.refresh')}
          >
            <RefreshCw className={cn('w-5 h-5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors', isRefreshing && 'animate-refresh-spin text-[var(--color-accent-blue)]')} />
          </button>

          <button
            onClick={() => { window.location.hash = '#/report'; }}
            className="p-2 rounded-lg hover:bg-[var(--color-bg-hover)] transition-colors"
            title={t('common.report')}
          >
            <BarChart3 className="w-5 h-5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors" />
          </button>

          <button
            onClick={() => { window.location.hash = '#/account'; }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--color-bg-hover)] hover:bg-[var(--color-bg-active)] border border-[var(--color-border-strong)] text-sm transition-colors"
            title={t('account.title')}
          >
            <Gauge className="w-4 h-4 text-[var(--color-accent-orange)]" />
            <span className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">{t('account.title')}</span>
          </button>

          {(updateStatus === 'available' || updateStatus === 'downloaded') && (
            <button
              onClick={() => setDialogOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[color:color-mix(in_srgb,var(--color-accent-blue)_15%,transparent)] border text-sm font-medium transition-colors"
              style={{ borderColor: 'color-mix(in srgb, var(--color-accent-blue) 30%, transparent)', color: '#60a5fa' }}
            >
              <ArrowDownCircle className="w-4 h-4" />
              {t('header.update')}
            </button>
          )}

          <button
            onClick={() => setView('settings')}
            className="p-2 rounded-lg hover:bg-[var(--color-bg-hover)] transition-colors"
            title="Settings"
          >
            <Settings className="w-5 h-5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors" />
          </button>
        </div>
      </div>
    </header>
  );
}
