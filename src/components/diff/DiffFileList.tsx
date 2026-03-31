import { useState, useMemo } from 'react';
import { FileCode, ChevronRight, ChevronDown } from 'lucide-react';
import type { FileChange } from '../../types/statistics';
import { UnifiedDiff } from './UnifiedDiff';
import { SideBySideDiff } from './SideBySideDiff';
import { useTranslation } from '../../lib/i18n';

interface DiffFileListProps {
  files: FileChange[];
  viewMode: 'unified' | 'side-by-side';
  searchQuery: string;
}

// Map file extensions to color classes for badges
function getExtensionColor(ext: string): { bg: string; text: string } {
  const map: Record<string, { bg: string; text: string }> = {
    ts: { bg: 'bg-[#3178c6]/15', text: 'text-[#3178c6]' },
    tsx: { bg: 'bg-[#3178c6]/15', text: 'text-[#3178c6]' },
    js: { bg: 'bg-[#f7df1e]/15', text: 'text-[#f7df1e]' },
    jsx: { bg: 'bg-[#f7df1e]/15', text: 'text-[#f7df1e]' },
    py: { bg: 'bg-[#3776ab]/15', text: 'text-[#5b9bd5]' },
    rs: { bg: 'bg-[#dea584]/15', text: 'text-[#dea584]' },
    go: { bg: 'bg-[#00add8]/15', text: 'text-[#00add8]' },
    css: { bg: 'bg-[#a855f7]/15', text: 'text-[#a855f7]' },
    scss: { bg: 'bg-[#c6538c]/15', text: 'text-[#c6538c]' },
    html: { bg: 'bg-[#e34c26]/15', text: 'text-[#e34c26]' },
    json: { bg: 'bg-[#f59e0b]/15', text: 'text-[#f59e0b]' },
    toml: { bg: 'bg-[#f59e0b]/15', text: 'text-[#f59e0b]' },
    yaml: { bg: 'bg-[#f59e0b]/15', text: 'text-[#f59e0b]' },
    yml: { bg: 'bg-[#f59e0b]/15', text: 'text-[#f59e0b]' },
    md: { bg: 'bg-[var(--color-bg-active)]', text: 'text-[var(--color-text-tertiary)]' },
    svg: { bg: 'bg-[#ffb13b]/15', text: 'text-[#ffb13b]' },
    lock: { bg: 'bg-[var(--color-bg-active)]', text: 'text-[var(--color-text-muted)]' },
  };
  return map[ext.toLowerCase()] ?? { bg: 'bg-[var(--color-bg-active)]', text: 'text-[var(--color-text-muted)]' };
}

export function DiffFileList({ files, viewMode, searchQuery }: DiffFileListProps) {
  const { t } = useTranslation();
  const [expandedFiles, setExpandedFiles] = useState<Set<number>>(new Set());

  const filteredFiles = useMemo(
    () =>
      searchQuery
        ? files.filter((f) => f.file_path.toLowerCase().includes(searchQuery.toLowerCase()))
        : files,
    [files, searchQuery]
  );

  const toggleFile = (index: number) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  if (filteredFiles.length === 0) {
    return (
      <div className="bg-[var(--color-bg-surface)] rounded-xl p-8 border border-[var(--color-border-base)] text-center text-[var(--color-text-secondary)]">
        {t('codeChanges.noData')}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {filteredFiles.map((file, index) => {
        const isExpanded = expandedFiles.has(index);
        const isBinary = file.extension === 'bin' || (file.additions === 0 && file.deletions === 0 && !file.diff_content);
        const extColor = file.extension ? getExtensionColor(file.extension) : null;

        // Split path into directory and filename
        const lastSlash = file.file_path.lastIndexOf('/');
        const dirPath = lastSlash >= 0 ? file.file_path.substring(0, lastSlash + 1) : '';
        const fileName = lastSlash >= 0 ? file.file_path.substring(lastSlash + 1) : file.file_path;

        return (
          <div
            key={`${file.file_path}-${index}`}
            className={`bg-[var(--color-bg-surface)] rounded-lg border overflow-hidden transition-colors ${
              isExpanded ? 'border-[var(--color-border-strong)]' : 'border-[var(--color-border-base)]'
            }`}
          >
            {/* File header row */}
            <button
              className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-[var(--color-bg-elevated)] transition-colors text-left group"
              onClick={() => toggleFile(index)}
            >
              <span className="shrink-0 transition-transform duration-200">
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-[var(--color-text-muted)] group-hover:text-[var(--color-text-secondary)]" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-[var(--color-text-muted)] group-hover:text-[var(--color-text-secondary)]" />
                )}
              </span>
              <FileCode className="w-4 h-4 text-[var(--color-text-tertiary)] shrink-0" />
              <span className="text-sm font-mono truncate flex-1" title={file.file_path}>
                <span className="text-[var(--color-text-muted)]">{dirPath}</span>
                <span className="text-[var(--color-text-primary)]">{fileName}</span>
              </span>
              {file.extension && extColor && (
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${extColor.bg} ${extColor.text} shrink-0 font-mono`}>
                  .{file.extension}
                </span>
              )}
              <div className="flex items-center gap-2 text-xs shrink-0 ml-1 font-mono">
                {file.additions > 0 && (
                  <span className="text-[var(--color-accent-green)]">+{file.additions}</span>
                )}
                {file.deletions > 0 && (
                  <span className="text-[var(--color-accent-red)]">-{file.deletions}</span>
                )}
              </div>
            </button>

            {/* Expanded diff content */}
            {isExpanded && (
              <div className="border-t border-[var(--color-border-base)]">
                {isBinary ? (
                  <div className="mx-4 my-3 px-4 py-3 text-sm text-[var(--color-text-secondary)] bg-[var(--color-bg-base)] rounded-lg border border-[var(--color-border-base)] text-center">
                    {t('codeChanges.binaryFile')}
                  </div>
                ) : viewMode === 'unified' ? (
                  <UnifiedDiff
                    diffContent={file.diff_content}
                    additions={file.additions}
                    deletions={file.deletions}
                  />
                ) : (
                  <SideBySideDiff
                    diffContent={file.diff_content}
                    additions={file.additions}
                    deletions={file.deletions}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
