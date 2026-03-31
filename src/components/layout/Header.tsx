import { useEffect, useMemo, useRef, useState } from 'react';
import { useFilterStore } from '../../stores/filterStore';
import { useAppStore } from '../../stores/appStore';
import { useProjects, useAvailableProviders } from '../../hooks/useStatistics';
import { useTranslation } from '../../lib/i18n';
import { cn } from '../../lib/utils';
import { ArrowLeft, ChevronDown, RefreshCw, Settings, BarChart3, ArrowDownCircle, Gauge, Check } from 'lucide-react';
import { useUpdateStore } from '../../stores/updateStore';
import { HeaderTimeRangeControl } from '../time-ranges/HeaderTimeRangeControl';

interface HeaderProps {
  onRefresh: () => void;
  isRefreshing: boolean;
}

interface HeaderSelectOption {
  label: string;
  value: string;
}

function HeaderSelect({
  value,
  options,
  placeholder,
  onChange,
  className,
}: {
  value: string;
  options: HeaderSelectOption[];
  placeholder: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'w-full flex items-center justify-between gap-3 rounded-2xl border border-[var(--color-border-base)] bg-[var(--color-bg-elevated)] px-5 py-3 text-left text-sm shadow-[0_1px_2px_rgba(15,23,42,0.05),0_6px_18px_rgba(15,23,42,0.06)] transition-all',
          open
            ? 'border-[var(--color-accent-blue)] bg-[var(--color-bg-surface)] shadow-[0_10px_30px_rgba(37,99,235,0.12)]'
            : 'hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-surface)]'
        )}
      >
        <span className={cn(selected ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-secondary)]', 'truncate')}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-[var(--color-text-tertiary)] transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+10px)] z-50 overflow-hidden rounded-2xl border border-[var(--color-border-base)] bg-[var(--color-bg-surface)] p-1.5 shadow-[0_22px_50px_rgba(15,23,42,0.18)] backdrop-blur">
          <div className="max-h-72 overflow-y-auto">
            {options.map((option) => {
              const isSelected = option.value === value;

              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                    buttonRef.current?.focus();
                  }}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm transition-all',
                    isSelected
                      ? 'bg-[color:color-mix(in_srgb,var(--color-accent-blue)_14%,var(--color-bg-surface))] text-[var(--color-accent-blue)]'
                      : 'text-[var(--color-text-primary)] hover:bg-[var(--color-bg-elevated)]'
                  )}
                >
                  <span className="truncate">{option.label}</span>
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                    {isSelected && <Check className="h-4 w-4" />}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function Header({ onRefresh, isRefreshing }: HeaderProps) {
  const { selectedProject, selectedProvider, setProject, setProvider } = useFilterStore();
  const { data: projects } = useProjects();
  const { data: providers } = useAvailableProviders();
  const { currentView, setView } = useAppStore();
  const { t } = useTranslation();
  const { status: updateStatus, setDialogOpen } = useUpdateStore();
  const projectOptions = useMemo<HeaderSelectOption[]>(
    () => [
      { label: t('header.allProjects'), value: '' },
      ...(projects?.map((project) => ({ label: project.name, value: project.name })) ?? []),
    ],
    [projects, t]
  );
  const providerOptions = useMemo<HeaderSelectOption[]>(
    () => [
      { label: t('header.allProviders'), value: '' },
      ...(providers?.map((provider) => ({ label: provider, value: provider })) ?? []),
    ],
    [providers, t]
  );

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
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-8 h-8 bg-gradient-to-br from-[var(--color-accent-blue)] to-[#6366f1] rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
            <span className="text-white font-bold text-lg">C</span>
          </div>
          <h1 className="text-lg font-semibold whitespace-nowrap">
            CC <span className="text-[var(--color-text-secondary)]">Statistics</span>
          </h1>
        </div>

        <div className="flex flex-1 min-w-0 items-center justify-end gap-2.5">
          <HeaderSelect
            value={selectedProject || ''}
            options={projectOptions}
            placeholder={t('header.allProjects')}
            onChange={(value) => setProject(value || null)}
            className="w-[280px] max-w-[280px] shrink"
          />

          {providers && providers.length > 1 && (
            <HeaderSelect
              value={selectedProvider || ''}
              options={providerOptions}
              placeholder={t('header.allProviders')}
              onChange={(value) => setProvider(value || null)}
              className="w-[220px] max-w-[220px] shrink"
            />
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
            className="shrink-0 whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--color-bg-hover)] hover:bg-[var(--color-bg-active)] border border-[var(--color-border-strong)] text-sm transition-colors"
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
            className="shrink-0 p-2 rounded-lg hover:bg-[var(--color-bg-hover)] transition-colors"
            title="Settings"
          >
            <Settings className="w-5 h-5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors" />
          </button>
        </div>
      </div>
    </header>
  );
}
