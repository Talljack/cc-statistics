import type { DiffContent, DiffLine } from '../../types/statistics';
import { useTranslation } from '../../lib/i18n';

interface UnifiedDiffProps {
  diffContent: DiffContent | null;
  additions: number;
  deletions: number;
  maxLines?: number;
}

function textPairToDiffLines(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const lines: DiffLine[] = [];

  const maxLen = Math.max(oldLines.length, newLines.length);
  let oi = 0;
  let ni = 0;

  while (oi < oldLines.length || ni < newLines.length) {
    if (oi < oldLines.length && ni < newLines.length && oldLines[oi] === newLines[ni]) {
      lines.push({ kind: 'context', content: oldLines[oi] });
      oi++;
      ni++;
    } else {
      // Collect a hunk of differences
      let matchFound = false;

      // Look ahead for next matching line (simple greedy approach)
      for (let look = 1; look <= Math.min(10, maxLen - Math.min(oi, ni)); look++) {
        if (oi + look < oldLines.length && ni < newLines.length && oldLines[oi + look] === newLines[ni]) {
          // Old lines were removed
          for (let k = 0; k < look; k++) {
            lines.push({ kind: 'remove', content: oldLines[oi + k] });
          }
          oi += look;
          matchFound = true;
          break;
        }
        if (ni + look < newLines.length && oi < oldLines.length && newLines[ni + look] === oldLines[oi]) {
          // New lines were added
          for (let k = 0; k < look; k++) {
            lines.push({ kind: 'add', content: newLines[ni + k] });
          }
          ni += look;
          matchFound = true;
          break;
        }
      }

      if (!matchFound) {
        // No nearby match, treat as replacement
        if (oi < oldLines.length) {
          lines.push({ kind: 'remove', content: oldLines[oi] });
          oi++;
        }
        if (ni < newLines.length) {
          lines.push({ kind: 'add', content: newLines[ni] });
          ni++;
        }
      }
    }
  }

  return lines;
}

function getDiffLines(diffContent: DiffContent | null): DiffLine[] | null {
  if (!diffContent) return null;

  switch (diffContent.type) {
    case 'Patch':
      return diffContent.lines;
    case 'TextPair':
      return textPairToDiffLines(diffContent.old, diffContent.new);
    case 'Created':
      return diffContent.content.split('\n').map((line: string) => ({ kind: 'add' as const, content: line }));
  }
}

export function UnifiedDiff({ diffContent, additions, deletions, maxLines = 500 }: UnifiedDiffProps) {
  const { t } = useTranslation();
  const lines = getDiffLines(diffContent);

  if (!lines) {
    return (
      <div className="mx-4 my-3 px-4 py-3 text-sm text-[#a0a0a0] bg-[#111] rounded-lg border border-[#2a2a2a] flex items-center gap-2">
        <span className="text-[#4ade80] font-mono">+{additions}</span>
        <span className="text-[#555]">/</span>
        <span className="text-[#f87171] font-mono">-{deletions}</span>
        <span className="ml-2 text-[#666]">{t('codeChanges.diffUnavailable')}</span>
      </div>
    );
  }

  const truncated = lines.length > maxLines;
  const displayLines = truncated ? lines.slice(0, maxLines) : lines;

  let addLineNum = 0;
  let removeLineNum = 0;

  return (
    <div className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] leading-[20px] font-mono border-collapse">
          <tbody>
            {displayLines.map((line, i) => {
              if (line.kind === 'add') addLineNum++;
              else if (line.kind === 'remove') removeLineNum++;
              else {
                addLineNum++;
                removeLineNum++;
              }

              const bgClass =
                line.kind === 'add'
                  ? 'bg-[#22c55e]/[0.08]'
                  : line.kind === 'remove'
                    ? 'bg-[#ef4444]/[0.08]'
                    : '';
              const textClass =
                line.kind === 'add'
                  ? 'text-[#4ade80]'
                  : line.kind === 'remove'
                    ? 'text-[#f87171]'
                    : 'text-[#808080]';
              const prefix =
                line.kind === 'add' ? '+' : line.kind === 'remove' ? '-' : ' ';
              const lineNumClass =
                line.kind === 'add'
                  ? 'text-[#22c55e]/30'
                  : line.kind === 'remove'
                    ? 'text-[#ef4444]/30'
                    : 'text-[#4a4a4a]';

              return (
                <tr key={i} className={`${bgClass} hover:brightness-125 transition-[filter] duration-75`}>
                  <td className={`px-3 py-0 text-right select-none w-[52px] min-w-[52px] border-r border-[#2a2a2a] ${lineNumClass}`}>
                    {line.kind !== 'add' ? removeLineNum : ''}
                  </td>
                  <td className={`px-3 py-0 text-right select-none w-[52px] min-w-[52px] border-r border-[#2a2a2a] ${lineNumClass}`}>
                    {line.kind !== 'remove' ? addLineNum : ''}
                  </td>
                  <td className={`pl-4 pr-4 py-0 whitespace-pre ${textClass}`}>
                    <span className="select-none inline-block w-4 text-center opacity-60">{prefix}</span>
                    {line.content}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {truncated && (
        <div className="px-4 py-2.5 text-xs text-[#a0a0a0] border-t border-[#2a2a2a] bg-[#1a1a1a] text-center">
          {t('codeChanges.linesShown')
            .replace('{n}', String(maxLines))
            .replace('{total}', String(lines.length))}
        </div>
      )}
    </div>
  );
}
