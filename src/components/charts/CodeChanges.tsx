import type { CodeChanges as CodeChangesType } from '../../types/statistics';

interface CodeChangesProps {
  codeChanges: CodeChangesType;
}

export function CodeChanges({ codeChanges }: CodeChangesProps) {
  const { total, by_extension } = codeChanges;
  const extensions = Object.entries(by_extension);

  const sortedExtensions = extensions
    .map(([ext, changes]) => ({
      extension: ext,
      total: changes.additions + changes.deletions,
      ...changes,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  const maxChanges = sortedExtensions.length > 0
    ? Math.max(...sortedExtensions.map(e => e.total))
    : 0;

  return (
    <div className="bg-[#1a1a1a] rounded-xl p-5 border border-[#2a2a2a]">
      <h3 className="text-lg font-semibold mb-4">Code Changes</h3>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <div className="p-3 rounded-lg bg-[#3b82f6]/5 border border-[#3b82f6]/10 text-center">
          <div className="text-xl font-bold text-[#3b82f6]">{total.files.toLocaleString()}</div>
          <div className="text-xs text-[#a0a0a0] mt-0.5">Files</div>
        </div>
        <div className="p-3 rounded-lg bg-[#22c55e]/5 border border-[#22c55e]/10 text-center">
          <div className="text-xl font-bold text-[#22c55e]">+{total.additions.toLocaleString()}</div>
          <div className="text-xs text-[#a0a0a0] mt-0.5">Added</div>
        </div>
        <div className="p-3 rounded-lg bg-[#ef4444]/5 border border-[#ef4444]/10 text-center">
          <div className="text-xl font-bold text-[#ef4444]">-{total.deletions.toLocaleString()}</div>
          <div className="text-xs text-[#a0a0a0] mt-0.5">Deleted</div>
        </div>
        <div className="p-3 rounded-lg bg-[#222] text-center">
          <div className="text-xl font-bold">
            {(total.additions - total.deletions).toLocaleString()}
          </div>
          <div className="text-xs text-[#a0a0a0] mt-0.5">Net</div>
        </div>
      </div>

      {/* Extensions with bars */}
      {sortedExtensions.length > 0 ? (
        <div className="space-y-2.5">
          {sortedExtensions.map((ext) => {
            const addPct = maxChanges > 0 ? (ext.additions / maxChanges) * 100 : 0;
            const delPct = maxChanges > 0 ? (ext.deletions / maxChanges) * 100 : 0;

            return (
              <div key={ext.extension}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-[#ccc]">.{ext.extension}</span>
                    <span className="text-xs text-[#666]">{ext.files} file{ext.files !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-[#22c55e]">+{ext.additions.toLocaleString()}</span>
                    <span className="text-[#ef4444]">-{ext.deletions.toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex gap-0.5 h-1.5">
                  {ext.additions > 0 && (
                    <div
                      className="h-full bg-[#22c55e] rounded-full"
                      style={{ width: `${addPct}%`, minWidth: '2px' }}
                    />
                  )}
                  {ext.deletions > 0 && (
                    <div
                      className="h-full bg-[#ef4444] rounded-full"
                      style={{ width: `${delPct}%`, minWidth: '2px' }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="h-[120px] flex items-center justify-center text-[#a0a0a0]">
          No code changes recorded
        </div>
      )}
    </div>
  );
}
