import type { CodeChanges as CodeChangesType } from '../../types/statistics';

interface CodeChangesProps {
  codeChanges: CodeChangesType;
}

export function CodeChanges({ codeChanges }: CodeChangesProps) {
  const { total, by_extension } = codeChanges;
  const extensions = Object.entries(by_extension);

  // Sort by total changes (additions + deletions) descending
  const sortedExtensions = extensions
    .map(([ext, changes]) => ({
      extension: ext,
      total: changes.additions + changes.deletions,
      ...changes,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10); // Top 10

  return (
    <div className="bg-[#1a1a1a] rounded-xl p-5 border border-[#2a2a2a]">
      <h3 className="text-lg font-semibold mb-4">Code Changes</h3>

      {/* Summary */}
      <div className="flex items-center gap-6 mb-6">
        <div className="flex items-center gap-2">
          <span className="text-[#22c55e] font-semibold text-xl">+{total.additions.toLocaleString()}</span>
          <span className="text-[#a0a0a0]">added</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[#ef4444] font-semibold text-xl">-{total.deletions.toLocaleString()}</span>
          <span className="text-[#a0a0a0]">deleted</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-xl">
            {(total.additions - total.deletions).toLocaleString()}
          </span>
          <span className="text-[#a0a0a0]">net</span>
        </div>
      </div>

      {/* Extensions Table */}
      {sortedExtensions.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-[#a0a0a0] text-sm border-b border-[#2a2a2a]">
                <th className="text-left py-2 pr-4">Extension</th>
                <th className="text-right py-2 pr-4">Added</th>
                <th className="text-right py-2">Deleted</th>
              </tr>
            </thead>
            <tbody>
              {sortedExtensions.map((ext) => (
                <tr key={ext.extension} className="border-b border-[#2a2a2a]/50">
                  <td className="py-2 pr-4">
                    <span className="font-mono text-sm">.{ext.extension}</span>
                  </td>
                  <td className="text-right py-2 pr-4">
                    <span className="text-[#22c55e]">+{ext.additions.toLocaleString()}</span>
                  </td>
                  <td className="text-right py-2">
                    <span className="text-[#ef4444]">-{ext.deletions.toLocaleString()}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-[150px] flex items-center justify-center text-[#a0a0a0]">
          No code changes recorded
        </div>
      )}
    </div>
  );
}
