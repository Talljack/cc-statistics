import { useEffect, useMemo, useState } from 'react';
import { useUpdateStore } from '../stores/updateStore';
import { useTranslation } from '../lib/i18n';
import { openUrl } from '@tauri-apps/plugin-opener';
import { X, Download, RotateCcw, Loader2, ArrowRight, CheckCircle2, AlertTriangle, ExternalLink, Copy, ChevronDown, ChevronUp } from 'lucide-react';

const LATEST_RELEASE_URL = 'https://github.com/Talljack/cc-statistics/releases/latest';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function UpdateDialog() {
  const {
    status, dialogOpen, currentVersion, newVersion, changelog,
    downloadProgress, downloadedBytes, totalBytes, error,
    setDialogOpen, downloadAndInstall, installUpdate, checkForUpdate,
  } = useUpdateStore();
  const { t } = useTranslation();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dialogOpen && status !== 'downloading') {
        setDialogOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dialogOpen, status, setDialogOpen]);

  useEffect(() => {
    if (status !== 'error') {
      setDetailsOpen(false);
      setCopied(false);
    }
  }, [status, error]);

  if (!dialogOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && status !== 'downloading') {
      setDialogOpen(false);
    }
  };

  const retryAction = useMemo(() => {
    if (!error) return checkForUpdate;
    if (error.stage === 'download') return downloadAndInstall;
    if (error.stage === 'install') return installUpdate;
    return checkForUpdate;
  }, [checkForUpdate, downloadAndInstall, error, installUpdate]);

  const openReleasePage = async () => {
    await openUrl(LATEST_RELEASE_URL);
  };

  const copyDiagnostics = async () => {
    if (!error?.technicalDetails || !navigator.clipboard) return;
    await navigator.clipboard.writeText(error.technicalDetails);
    setCopied(true);
  };

  // State C: Ready to Restart
  if (status === 'downloaded') {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={handleBackdropClick}>
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <div className="relative bg-[#1e1e1e] border border-[#333] rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          <div className="p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-green-400" />
              </div>
              <h2 className="text-lg font-semibold text-white">{t('update.restartTitle')}</h2>
            </div>
            <p className="text-sm text-[#a0a0a0] leading-relaxed ml-[52px]">
              {t('update.restartDesc')}
            </p>
          </div>
          <div className="flex gap-3 px-6 pb-6 justify-end">
            <button
              onClick={() => setDialogOpen(false)}
              className="px-5 py-2.5 rounded-lg border border-[#444] text-sm font-medium text-[#ccc] hover:bg-[#2a2a2a] hover:text-white transition-colors"
            >
              {t('update.later')}
            </button>
            <button
              onClick={installUpdate}
              className="px-5 py-2.5 rounded-lg bg-[#3b82f6] text-sm font-medium text-white hover:bg-[#2563eb] transition-colors shadow-lg shadow-blue-500/20"
            >
              <span className="flex items-center gap-2">
                <RotateCcw className="w-4 h-4" />
                {t('update.restartNow')}
              </span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // State A & B: Available / Downloading / Error
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={handleBackdropClick}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-[#1e1e1e] border border-[#333] rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-0">
          <div>
            <h2 className="text-lg font-semibold text-white">{t('update.softwareUpdate')}</h2>
            <p className="text-sm text-[#a0a0a0] mt-1">{t('update.newVersionAvailable')}</p>
          </div>
          {status !== 'downloading' && (
            <button
              onClick={() => setDialogOpen(false)}
              className="p-1.5 rounded-lg hover:bg-[#2a2a2a] transition-colors -mr-1 -mt-1"
            >
              <X className="w-4 h-4 text-[#666] hover:text-[#a0a0a0]" />
            </button>
          )}
        </div>

        {/* Version Display */}
        <div className="px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="text-xl font-mono text-[#888]">{currentVersion}</span>
            <ArrowRight className="w-5 h-5 text-[#555]" />
            <span className="text-xl font-mono font-semibold text-white">{newVersion}</span>
          </div>
        </div>

        {/* Changelog */}
        <div className="px-6 pb-4">
          <div className="text-[11px] font-semibold text-[#666] uppercase tracking-wider mb-2">
            {t('update.whatsNew')}
          </div>
          <div className="bg-[#161616] border border-[#2a2a2a] rounded-lg p-4 max-h-40 overflow-y-auto">
            <p className="text-sm text-[#b0b0b0] leading-relaxed whitespace-pre-wrap">
              {changelog || t('update.noChangelog')}
            </p>
          </div>
        </div>

        {/* Progress Bar (downloading state) */}
        {status === 'downloading' && (
          <div className="px-6 pb-2">
            <div className="flex items-center justify-between text-xs text-[#888] mb-2">
              <span>{downloadProgress}%</span>
              <span>
                {formatBytes(downloadedBytes)}
                {totalBytes > 0 && ` / ${formatBytes(totalBytes)}`}
              </span>
            </div>
            <div className="w-full h-2 bg-[#2a2a2a] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#3b82f6] to-[#60a5fa] rounded-full transition-all duration-300 ease-out"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div className="px-6 pb-2">
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 w-9 h-9 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-red-300">
                    {t(error?.titleKey || 'update.errorTitle')}
                  </p>
                  <p className="text-sm text-red-200/90 leading-relaxed mt-1">
                    {t(error?.summaryKey || 'update.errorTitle')}
                  </p>

                  {error?.suggestionKeys.length ? (
                    <div className="mt-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-red-200/60 mb-2">
                        {t('update.nextSteps')}
                      </p>
                      <ul className="space-y-1.5">
                        {error.suggestionKeys.map((suggestionKey) => (
                          <li key={suggestionKey} className="text-sm text-red-100/90 leading-relaxed">
                            {`\u2022 ${t(suggestionKey)}`}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {error?.url && (
                    <div className="mt-3 rounded-lg border border-red-500/15 bg-black/15 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wider text-red-200/55 mb-1">
                        {t('update.requestUrl')}
                      </p>
                      <p className="text-xs font-mono text-red-100/85 break-all">{error.url}</p>
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={openReleasePage}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-400/20 px-3 py-1.5 text-xs font-medium text-red-100 hover:bg-red-500/10 transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      {t('update.openReleasePage')}
                    </button>
                    <button
                      onClick={copyDiagnostics}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-400/20 px-3 py-1.5 text-xs font-medium text-red-100 hover:bg-red-500/10 transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      {copied ? t('update.copiedDiagnostics') : t('update.copyDiagnostics')}
                    </button>
                    <button
                      onClick={() => setDetailsOpen((open) => !open)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-400/20 px-3 py-1.5 text-xs font-medium text-red-100 hover:bg-red-500/10 transition-colors"
                    >
                      {detailsOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      {detailsOpen ? t('update.hideTechnicalDetails') : t('update.showTechnicalDetails')}
                    </button>
                  </div>

                  {detailsOpen && error?.technicalDetails && (
                    <div className="mt-3 rounded-lg border border-red-500/15 bg-black/25 p-3">
                      <p className="text-[11px] uppercase tracking-wider text-red-200/55 mb-2">
                        {t('update.technicalDetails')}
                      </p>
                      <pre className="text-xs font-mono text-red-100/90 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                        {error.technicalDetails}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 p-6 pt-4 justify-end">
          {status !== 'downloading' && (
            <button
              onClick={() => setDialogOpen(false)}
              className="px-5 py-2.5 rounded-lg border border-[#444] text-sm font-medium text-[#ccc] hover:bg-[#2a2a2a] hover:text-white transition-colors"
            >
              {t('common.cancel')}
            </button>
          )}

          {status === 'available' && (
            <button
              onClick={downloadAndInstall}
              className="px-5 py-2.5 rounded-lg bg-[#3b82f6] text-sm font-medium text-white hover:bg-[#2563eb] transition-colors shadow-lg shadow-blue-500/20"
            >
              <span className="flex items-center gap-2">
                <Download className="w-4 h-4" />
                {t('update.downloadInstall')}
              </span>
            </button>
          )}

          {status === 'downloading' && (
            <button
              disabled
              className="px-5 py-2.5 rounded-lg bg-[#3b82f6]/60 text-sm font-medium text-white/80 cursor-not-allowed"
            >
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('update.downloading')}
              </span>
            </button>
          )}

          {status === 'error' && (
            <button
              onClick={retryAction}
              className="px-5 py-2.5 rounded-lg bg-[#3b82f6] text-sm font-medium text-white hover:bg-[#2563eb] transition-colors shadow-lg shadow-blue-500/20"
            >
              {t('common.retry')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
