import type { DiffContent, DiffLine } from '../../types/statistics';
import { useTranslation } from '../../lib/i18n';

interface SideBySideDiffProps {
  diffContent: DiffContent | null;
  additions: number;
  deletions: number;
  maxLines?: number;
}

function textPairToDiffLines(oldText: string, newText: string): { left: (DiffLine | null)[]; right: (DiffLine | null)[] } {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const left: (DiffLine | null)[] = [];
  const right: (DiffLine | null)[] = [];

  let oi = 0;
  let ni = 0;

  while (oi < oldLines.length || ni < newLines.length) {
    if (oi < oldLines.length && ni < newLines.length && oldLines[oi] === newLines[ni]) {
      left.push({ kind: 'context', content: oldLines[oi] });
      right.push({ kind: 'context', content: newLines[ni] });
      oi++;
      ni++;
    } else {
      // Collect removed then added

      // Look for next match
      let matchOi = -1;
      let matchNi = -1;
      outerLoop:
      for (let look = 1; look <= 10; look++) {
        for (let a = 0; a <= look; a++) {
          const b = look - a;
          if (oi + a < oldLines.length && ni + b < newLines.length && oldLines[oi + a] === newLines[ni + b]) {
            matchOi = oi + a;
            matchNi = ni + b;
            break outerLoop;
          }
        }
      }

      if (matchOi >= 0 && matchNi >= 0) {
        const removedCount = matchOi - oi;
        const addedCount = matchNi - ni;
        const maxPairs = Math.max(removedCount, addedCount);

        for (let k = 0; k < maxPairs; k++) {
          left.push(k < removedCount ? { kind: 'remove', content: oldLines[oi + k] } : null);
          right.push(k < addedCount ? { kind: 'add', content: newLines[ni + k] } : null);
        }

        oi = matchOi;
        ni = matchNi;
      } else {
        // No match found, pair them up
        if (oi < oldLines.length && ni < newLines.length) {
          left.push({ kind: 'remove', content: oldLines[oi] });
          right.push({ kind: 'add', content: newLines[ni] });
          oi++;
          ni++;
        } else if (oi < oldLines.length) {
          left.push({ kind: 'remove', content: oldLines[oi] });
          right.push(null);
          oi++;
        } else {
          left.push(null);
          right.push({ kind: 'add', content: newLines[ni] });
          ni++;
        }
      }
    }
  }

  return { left, right };
}

interface SideBySideRow {
  left: DiffLine | null;
  right: DiffLine | null;
}

function getSideBySideRows(diffContent: DiffContent | null): SideBySideRow[] | null {
  if (!diffContent) return null;

  if (diffContent.type === 'TextPair') {
    const { left, right } = textPairToDiffLines(diffContent.old, diffContent.new);
    return left.map((l, i) => ({ left: l, right: right[i] ?? null }));
  }

  if (diffContent.type === 'Created') {
    return diffContent.content.split('\n').map((line: string) => ({
      left: null,
      right: { kind: 'add' as const, content: line },
    }));
  }

  // Patch: convert sequential diff lines to side-by-side
  const lines = diffContent.lines;
  const rows: SideBySideRow[] = [];
  let i = 0;

  while (i < lines.length) {
    if (lines[i].kind === 'context') {
      rows.push({ left: lines[i], right: lines[i] });
      i++;
    } else {
      // Collect consecutive removes and adds
      const removes: DiffLine[] = [];
      const adds: DiffLine[] = [];

      while (i < lines.length && lines[i].kind === 'remove') {
        removes.push(lines[i]);
        i++;
      }
      while (i < lines.length && lines[i].kind === 'add') {
        adds.push(lines[i]);
        i++;
      }

      const maxLen = Math.max(removes.length, adds.length);
      for (let k = 0; k < maxLen; k++) {
        rows.push({
          left: k < removes.length ? removes[k] : null,
          right: k < adds.length ? adds[k] : null,
        });
      }
    }
  }

  return rows;
}

export function SideBySideDiff({ diffContent, additions, deletions, maxLines = 500 }: SideBySideDiffProps) {
  const { t } = useTranslation();
  const rows = getSideBySideRows(diffContent);

  if (!rows) {
    return (
      <div className="mx-4 my-3 px-4 py-3 text-sm text-[#a0a0a0] bg-[#111] rounded-lg border border-[#2a2a2a] flex items-center gap-2">
        <span className="text-[#4ade80] font-mono">+{additions}</span>
        <span className="text-[#555]">/</span>
        <span className="text-[#f87171] font-mono">-{deletions}</span>
        <span className="ml-2 text-[#666]">{t('codeChanges.diffUnavailable')}</span>
      </div>
    );
  }

  const truncated = rows.length > maxLines;
  const displayRows = truncated ? rows.slice(0, maxLines) : rows;

  let leftLineNum = 0;
  let rightLineNum = 0;

  return (
    <div className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] leading-[20px] font-mono border-collapse">
          <tbody>
            {displayRows.map((row, i) => {
              if (row.left && row.left.kind !== 'add') leftLineNum++;
              if (row.right && row.right.kind !== 'remove') rightLineNum++;

              const leftBg = row.left?.kind === 'remove' ? 'bg-[#ef4444]/[0.08]' : '';
              const rightBg = row.right?.kind === 'add' ? 'bg-[#22c55e]/[0.08]' : '';
              const leftTextClass = row.left?.kind === 'remove' ? 'text-[#f87171]' : 'text-[#808080]';
              const rightTextClass = row.right?.kind === 'add' ? 'text-[#4ade80]' : 'text-[#808080]';
              const leftLineNumClass = row.left?.kind === 'remove' ? 'text-[#ef4444]/30' : 'text-[#4a4a4a]';
              const rightLineNumClass = row.right?.kind === 'add' ? 'text-[#22c55e]/30' : 'text-[#4a4a4a]';
              const emptyBg = 'bg-[#0a0a0a]';

              return (
                <tr key={i}>
                  {/* Left side */}
                  <td className={`px-3 py-0 text-right select-none w-[52px] min-w-[52px] border-r border-[#2a2a2a] ${row.left ? leftBg : emptyBg} ${leftLineNumClass}`}>
                    {row.left ? leftLineNum : ''}
                  </td>
                  <td className={`pl-4 pr-4 py-0 whitespace-pre w-1/2 border-r border-[#2a2a2a] ${row.left ? `${leftBg} ${leftTextClass}` : emptyBg}`}>
                    {row.left ? (
                      <>
                        <span className="select-none inline-block w-4 text-center opacity-60">{row.left.kind === 'remove' ? '-' : ' '}</span>
                        {row.left.content}
                      </>
                    ) : null}
                  </td>
                  {/* Right side */}
                  <td className={`px-3 py-0 text-right select-none w-[52px] min-w-[52px] border-r border-[#2a2a2a] ${row.right ? rightBg : emptyBg} ${rightLineNumClass}`}>
                    {row.right ? rightLineNum : ''}
                  </td>
                  <td className={`pl-4 pr-4 py-0 whitespace-pre w-1/2 ${row.right ? `${rightBg} ${rightTextClass}` : emptyBg}`}>
                    {row.right ? (
                      <>
                        <span className="select-none inline-block w-4 text-center opacity-60">{row.right.kind === 'add' ? '+' : ' '}</span>
                        {row.right.content}
                      </>
                    ) : null}
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
            .replace('{total}', String(rows.length))}
        </div>
      )}
    </div>
  );
}
