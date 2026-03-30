import { useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { useTranslation } from '../../lib/i18n';
import type { SessionInfo } from '../../types/statistics';

type ExportFormat = 'csv' | 'json' | 'markdown';

interface ExportButtonProps {
  sessions: SessionInfo[];
  title?: string;
}

const FORMAT_OPTIONS: { format: ExportFormat; label: string; ext: string }[] = [
  { format: 'csv', label: 'CSV', ext: 'csv' },
  { format: 'json', label: 'JSON', ext: 'json' },
  { format: 'markdown', label: 'Markdown', ext: 'md' },
];

export function ExportButton({ sessions, title }: ExportButtonProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const disabled = exporting || sessions.length === 0;

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  async function handleSelect(format: ExportFormat, ext: string) {
    setOpen(false);
    setExporting(true);
    try {
      const content = await invoke<string>('export_report', {
        sessions,
        format,
        title,
      });
      const filePath = await save({
        defaultPath: `report.${ext}`,
        filters: [{ name: format.toUpperCase(), extensions: [ext] }],
      });
      if (filePath) {
        await writeTextFile(filePath, content);
      }
    } finally {
      setExporting(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded bg-[#2a2a2a] border border-[#3a3a3a] hover:bg-[#333] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <Download size={14} />
        {t('export.button')}
      </button>

      {open && (
        <div className="absolute right-0 mt-1 z-50 min-w-[120px] rounded border border-[#3a3a3a] bg-[#2a2a2a] shadow-lg">
          {FORMAT_OPTIONS.map(({ format, label, ext }) => (
            <button
              key={format}
              onClick={() => handleSelect(format, ext)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-[#333] transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
