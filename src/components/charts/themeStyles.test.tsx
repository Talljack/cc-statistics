import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { DevTimeChart } from './DevTimeChart';
import { TokenChart } from './TokenChart';
import { CodeChanges } from './CodeChanges';
import { ToolUsageChart } from './ToolUsageChart';
import { McpUsageChart } from './McpUsageChart';
import { SkillUsageChart } from './SkillUsageChart';
import { useSettingsStore } from '../../stores/settingsStore';

describe('dashboard theme styles', () => {
  it('uses theme variables for dashboard chart surfaces and neutral tracks', () => {
    useSettingsStore.setState({ language: 'en' });

    const { container } = render(
      <div>
        <DevTimeChart
          devTime={{
            total_ms: 3_723_000,
            ai_time_ms: 3_000_000,
            user_time_ms: 723_000,
            ai_ratio: 80.6,
          }}
        />
        <TokenChart
          tokens={{
            input: 1_000,
            output: 500,
            cache_read: 250,
            cache_creation: 100,
            by_model: {
              'model-a': {
                input: 1_000,
                output: 500,
                cache_read: 250,
                cache_creation: 100,
                cost_usd: 0,
              },
            },
          }}
          costByModel={{ 'model-a': 1.25 }}
        />
        <CodeChanges
          codeChanges={{
            total: { files: 3, additions: 120, deletions: 45 },
            by_extension: {
              ts: { files: 2, additions: 100, deletions: 20 },
              rs: { files: 1, additions: 20, deletions: 25 },
            },
          }}
        />
        <ToolUsageChart toolUsage={{ read: 12, write: 6 }} />
        <McpUsageChart mcpUsage={{ 'mcp__github__search': 4, 'mcp__github__open_pr': 2 }} />
        <SkillUsageChart skillUsage={{ debug: 3, review: 1 }} />
      </div>
    );

    const html = container.innerHTML;
    expect(html).toContain('bg-[var(--color-bg-surface)]');
    expect(html).toContain('border-[var(--color-border-base)]');
    expect(html).toContain('bg-[var(--color-bg-hover)]');
    expect(html).not.toContain('bg-[#1a1a1a]');
    expect(html).not.toContain('border-[#2a2a2a]');
    expect(html).not.toContain('bg-[#2a2a2a]');
  });
});
