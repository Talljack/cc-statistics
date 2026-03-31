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

function formatSelectionSummary(
  selectedValues: string[],
  options: HeaderSelectOption[],
  placeholder: string,
  language: string,
) {
  if (selectedValues.length === 0) {
    return placeholder;
  }

  const selectedLabels = options
    .filter((option) => selectedValues.includes(option.value))
    .map((option) => option.label);

  if (selectedLabels.length <= 2) {
    return selectedLabels.join(', ');
  }

  if (language === 'zh') {
    return `已选 ${selectedLabels.length} 项`;
  }
  if (language === 'ja') {
    return `${selectedLabels.length}件を選択`;
  }
  return `${selectedLabels.length} selected`;
}

function getSelectAllLabel(language: string) {
  if (language === 'zh') return '全选';
  if (language === 'ja') return 'すべて選択';
  return 'Select all';
}

function getClearLabel(language: string) {
  if (language === 'zh') return '清空';
  if (language === 'ja') return 'クリア';
  return 'Clear';
}

function getConfirmLabel(language: string) {
  if (language === 'zh') return '确定';
  if (language === 'ja') return '完了';
  return 'OK';
}

function HeaderMultiSelect({
  selectedValues,
  options,
  placeholder,
  onChange,
  className,
  disabled = false,
}: {
  selectedValues: string[];
  options: HeaderSelectOption[];
  placeholder: string;
  onChange: (values: string[]) => void;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { language } = useTranslation();
  const summary = formatSelectionSummary(selectedValues, options, placeholder, language);
  const allSelected = options.length > 0 && selectedValues.length === options.length;

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
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'h-11 w-full flex items-center justify-between gap-2.5 rounded-xl border border-[var(--color-border-base)] bg-[color:color-mix(in_srgb,var(--color-bg-hover)_72%,var(--color-bg-surface))] px-3.5 py-2 text-left transition-all disabled:cursor-not-allowed disabled:opacity-60',
          open
            ? 'border-[color:color-mix(in_srgb,var(--color-accent-blue)_30%,var(--color-border-base))] bg-[var(--color-bg-surface)] shadow-[0_8px_24px_rgba(15,23,42,0.08)]'
            : 'hover:border-[var(--color-border-strong)] hover:bg-[color:color-mix(in_srgb,var(--color-bg-hover)_48%,var(--color-bg-surface))]'
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn(
            'truncate text-sm font-medium',
            selectedValues.length > 0
              ? 'text-[var(--color-text-primary)]'
              : 'text-[var(--color-text-secondary)]'
          )}>
            {summary}
          </span>
          {selectedValues.length > 0 && (
            <span className="shrink-0 rounded-full border border-[color:color-mix(in_srgb,var(--color-accent-blue)_22%,transparent)] bg-[color:color-mix(in_srgb,var(--color-accent-blue)_10%,var(--color-bg-surface))] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-[var(--color-accent-blue)]">
              {selectedValues.length}
            </span>
          )}
        </div>
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[color:color-mix(in_srgb,var(--color-bg-hover)_82%,var(--color-bg-surface))] text-[var(--color-text-tertiary)]">
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
        </span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-2xl border border-[var(--color-border-base)] bg-[var(--color-bg-surface)] p-2 shadow-[0_18px_40px_rgba(15,23,42,0.14)] backdrop-blur">
          <div className="mb-2 flex items-center justify-between rounded-xl bg-[color:color-mix(in_srgb,var(--color-bg-hover)_82%,var(--color-bg-surface))] px-3 py-2">
            <span className="text-xs font-medium text-[var(--color-text-secondary)]">{placeholder}</span>
            <button
              type="button"
              onClick={() => onChange([])}
              disabled={selectedValues.length === 0}
              className="text-xs font-medium text-[var(--color-accent-blue)] transition-opacity hover:opacity-80 disabled:opacity-40"
            >
              {getClearLabel(language)}
            </button>
          </div>
          <div className="max-h-80 space-y-1 overflow-y-auto pr-1">
            {options.length === 0 && (
              <div className="rounded-xl border border-dashed border-[var(--color-border-base)] px-3 py-4 text-center text-sm text-[var(--color-text-secondary)]">
                No options
              </div>
            )}
            {options.map((option) => {
              const isSelected = selectedValues.includes(option.value);

              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    const nextValues = isSelected
                      ? selectedValues.filter((value) => value !== option.value)
                      : [...selectedValues, option.value];
                    onChange(nextValues);
                  }}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm transition-all',
                    isSelected
                      ? 'border-[color:color-mix(in_srgb,var(--color-accent-blue)_32%,transparent)] bg-[color:color-mix(in_srgb,var(--color-accent-blue)_14%,var(--color-bg-surface))] text-[var(--color-accent-blue)]'
                      : 'border-transparent text-[var(--color-text-primary)] hover:border-[var(--color-border-base)] hover:bg-[color:color-mix(in_srgb,var(--color-bg-hover)_82%,var(--color-bg-surface))]'
                  )}
                >
                  <span className="truncate font-medium">{option.label}</span>
                  <span
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors',
                      isSelected
                        ? 'border-[var(--color-accent-blue)] bg-[var(--color-accent-blue)] text-white'
                        : 'border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] text-transparent'
                    )}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-[var(--color-border-base)] bg-[color:color-mix(in_srgb,var(--color-bg-hover)_82%,var(--color-bg-surface))] p-1.5">
            <button
              type="button"
              onClick={() => onChange(options.map((option) => option.value))}
              disabled={options.length === 0 || allSelected}
              className="flex-1 rounded-lg px-3 py-2 text-xs font-medium text-[var(--color-accent-blue)] transition-colors hover:bg-[var(--color-bg-surface)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {getSelectAllLabel(language)}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                buttonRef.current?.focus();
              }}
              className="flex-1 rounded-lg bg-[color:color-mix(in_srgb,var(--color-accent-blue)_12%,var(--color-bg-surface))] px-3 py-2 text-xs font-semibold text-[var(--color-accent-blue)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--color-accent-blue)_18%,var(--color-bg-surface))]"
            >
              {getConfirmLabel(language)}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Header({ onRefresh, isRefreshing }: HeaderProps) {
  const { selectedProjects, selectedProviders, setProjects, setProviders } = useFilterStore();
  const { data: projects } = useProjects();
  const { data: providers } = useAvailableProviders();
  const { currentView, setView } = useAppStore();
  const { t } = useTranslation();
  const { status: updateStatus, setDialogOpen } = useUpdateStore();
  const projectOptions = useMemo<HeaderSelectOption[]>(
    () => projects?.map((project) => ({ label: project.name, value: project.name })) ?? [],
    [projects, t]
  );
  const providerOptions = useMemo<HeaderSelectOption[]>(
    () => providers?.map((provider) => ({ label: provider, value: provider })) ?? [],
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
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:gap-6">
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-8 h-8 bg-gradient-to-br from-[var(--color-accent-blue)] to-[#6366f1] rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
            <span className="text-white font-bold text-lg">C</span>
          </div>
          <h1 className="text-lg font-semibold whitespace-nowrap">
            CC <span className="text-[var(--color-text-secondary)]">Statistics</span>
          </h1>
        </div>

        <div className="flex flex-1 min-w-0 flex-wrap items-center justify-start gap-2.5">
          <HeaderMultiSelect
            selectedValues={selectedProjects}
            options={projectOptions}
            placeholder={t('header.allProjects')}
            onChange={setProjects}
            className="w-[210px] max-w-[210px] shrink-0"
          />

          <HeaderMultiSelect
            selectedValues={selectedProviders}
            options={providerOptions}
            placeholder={t('header.allProviders')}
            onChange={setProviders}
            className="w-[210px] max-w-[210px] shrink-0"
          />

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
