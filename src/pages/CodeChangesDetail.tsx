import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFilterStore } from '../stores/filterStore';
import { useCodeChangesDetail } from '../hooks/useStatistics';
import { Header } from '../components/layout/Header';
import { DiffFileList } from '../components/diff/DiffFileList';
import { ArrowLeft, Search, FileCode, Plus, Minus, GitCommitHorizontal } from 'lucide-react';
import { useTranslation } from '../lib/i18n';

export function CodeChangesDetail() {
  const { t } = useTranslation();
  const { selectedProjects, activeTimeRange, selectedProviders } = useFilterStore();
  const navigate = useNavigate();
  const { data: files, isLoading } = useCodeChangesDetail(selectedProjects, activeTimeRange, selectedProviders);

  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'unified' | 'side-by-side'>('unified');

  const handleRefresh = () => {};

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-base)] flex flex-col">
        <Header onRefresh={handleRefresh} isRefreshing={false} />
        <main className="flex-1 p-6">
          {/* Back button + title skeleton */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-9 h-9 rounded-lg bg-[var(--color-bg-surface)] animate-pulse" />
            <div className="h-6 w-48 rounded bg-[var(--color-bg-surface)] animate-pulse" />
          </div>

          {/* Stats skeleton */}
          <div className="grid grid-cols-4 gap-3 mb-5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="p-4 rounded-xl bg-[var(--color-bg-surface)] border border-[var(--color-border-base)] animate-pulse">
                <div className="h-7 w-16 mx-auto rounded bg-[var(--color-bg-hover)] mb-2" />
                <div className="h-3 w-12 mx-auto rounded bg-[var(--color-bg-hover)]" />
              </div>
            ))}
          </div>

          {/* Toolbar skeleton */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-10 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border-base)] animate-pulse" />
            <div className="h-10 w-44 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border-base)] animate-pulse" />
          </div>

          {/* File list skeleton */}
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border-base)] animate-pulse" />
            ))}
          </div>
        </main>
      </div>
    );
  }

  const fileList = files ?? [];
  const totalFiles = fileList.length;
  const totalAdditions = fileList.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = fileList.reduce((sum, f) => sum + f.deletions, 0);
  const netChanges = totalAdditions - totalDeletions;

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)] flex flex-col">
      <Header onRefresh={handleRefresh} isRefreshing={false} />

      <main className="flex-1 p-6 overflow-auto">
        {/* Back button + title */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate('/')}
            className="p-2 rounded-lg hover:bg-[var(--color-bg-hover)] transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-[var(--color-text-secondary)]" />
          </button>
          <h2 className="text-xl font-semibold">
            {t('codeChanges.title')}
            <span className="text-[var(--color-text-secondary)] text-sm font-normal ml-2">
              {totalFiles} {t('codeChanges.files').toLowerCase()}
            </span>
          </h2>
        </div>

        {/* Summary stats bar - matching StatCard/CodeChanges card design */}
        <div className="grid grid-cols-4 gap-3 mb-5">
          <div className="bg-[var(--color-bg-surface)] rounded-xl p-4 border border-[var(--color-border-base)] relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl bg-[#3b82f6]" />
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-[var(--color-text-secondary)] font-medium">{t('codeChanges.files')}</span>
              <div className="p-1.5 rounded-lg bg-[#3b82f6]/10">
                <FileCode className="w-3.5 h-3.5 text-[#3b82f6]" />
              </div>
            </div>
            <div className="text-2xl font-bold text-[#3b82f6]">{totalFiles.toLocaleString()}</div>
          </div>
          <div className="bg-[var(--color-bg-surface)] rounded-xl p-4 border border-[var(--color-border-base)] relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl bg-[#22c55e]" />
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-[var(--color-text-secondary)] font-medium">{t('codeChanges.additions')}</span>
              <div className="p-1.5 rounded-lg bg-[#22c55e]/10">
                <Plus className="w-3.5 h-3.5 text-[#22c55e]" />
              </div>
            </div>
            <div className="text-2xl font-bold text-[#22c55e]">+{totalAdditions.toLocaleString()}</div>
          </div>
          <div className="bg-[var(--color-bg-surface)] rounded-xl p-4 border border-[var(--color-border-base)] relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl bg-[#ef4444]" />
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-[var(--color-text-secondary)] font-medium">{t('codeChanges.deletions')}</span>
              <div className="p-1.5 rounded-lg bg-[#ef4444]/10">
                <Minus className="w-3.5 h-3.5 text-[#ef4444]" />
              </div>
            </div>
            <div className="text-2xl font-bold text-[#ef4444]">-{totalDeletions.toLocaleString()}</div>
          </div>
          <div className="bg-[var(--color-bg-surface)] rounded-xl p-4 border border-[var(--color-border-base)] relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl bg-[#a855f7]" />
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-[var(--color-text-secondary)] font-medium">{t('codeChanges.net')}</span>
              <div className="p-1.5 rounded-lg bg-[#a855f7]/10">
                <GitCommitHorizontal className="w-3.5 h-3.5 text-[#a855f7]" />
              </div>
            </div>
            <div className={`text-2xl font-bold ${netChanges >= 0 ? 'text-[#a855f7]' : 'text-[#a855f7]'}`}>
              {netChanges >= 0 ? '+' : ''}{netChanges.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Toolbar: search + view mode toggle */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-faint)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('codeChanges.searchPlaceholder')}
              className="w-full pl-9 pr-4 py-2.5 bg-[var(--color-bg-surface)] border border-[var(--color-border-base)] rounded-lg text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-faint)] focus:outline-none focus:border-[#3b82f6]/50 transition-colors"
            />
          </div>
          <div className="flex rounded-lg bg-[var(--color-bg-hover)] border border-[var(--color-border-base)] p-0.5 shrink-0">
            <button
              className={`px-3.5 py-2 text-xs font-medium rounded-md transition-all ${
                viewMode === 'unified'
                  ? 'bg-[#3b82f6] text-white shadow-sm shadow-[#3b82f6]/25'
                  : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]'
              }`}
              onClick={() => setViewMode('unified')}
            >
              {t('codeChanges.unified')}
            </button>
            <button
              className={`px-3.5 py-2 text-xs font-medium rounded-md transition-all ${
                viewMode === 'side-by-side'
                  ? 'bg-[#3b82f6] text-white shadow-sm shadow-[#3b82f6]/25'
                  : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]'
              }`}
              onClick={() => setViewMode('side-by-side')}
            >
              {t('codeChanges.sideBySide')}
            </button>
          </div>
        </div>

        {/* File list */}
        <DiffFileList files={fileList} viewMode={viewMode} searchQuery={searchQuery} />
      </main>
    </div>
  );
}
