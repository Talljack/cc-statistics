import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Report } from './Report';

const navigateMock = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

vi.mock('../hooks/useStatistics', () => ({
  useStatistics: () => ({
    data: {
      sessions: 4,
      instructions: 8,
      duration_ms: 18_000,
      duration_formatted: '18s',
      tokens: {
        input: 1_000,
        output: 500,
        cache_read: 0,
        cache_creation: 0,
        by_model: {},
      },
    },
    isLoading: false,
  }),
  useSessions: () => ({
    data: [
      {
        session_id: 's1',
        project_name: 'cc-statistics',
        timestamp: '2026-03-30T01:00:00Z',
        duration_ms: 5_000,
        duration_formatted: '5s',
        total_tokens: 900,
        instructions: 2,
        model: 'model-a',
        git_branch: 'main',
        cost_usd: 1,
        source: 'codex',
        input: 0,
        output: 0,
        cache_read: 0,
        cache_creation: 0,
        tokens_by_model: {},
      },
      {
        session_id: 's2',
        project_name: 'cc-statistics',
        timestamp: '2026-03-31T01:00:00Z',
        duration_ms: 7_000,
        duration_formatted: '7s',
        total_tokens: 100,
        instructions: 1,
        model: 'model-a',
        git_branch: 'main',
        cost_usd: 0.25,
        source: 'codex',
        input: 0,
        output: 0,
        cache_read: 0,
        cache_creation: 0,
        tokens_by_model: {},
      },
      {
        session_id: 's3',
        project_name: 'cc-statistics',
        timestamp: '2026-03-31T02:00:00Z',
        duration_ms: 6_000,
        duration_formatted: '6s',
        total_tokens: 100,
        instructions: 1,
        model: 'model-a',
        git_branch: 'main',
        cost_usd: 0.25,
        source: 'codex',
        input: 0,
        output: 0,
        cache_read: 0,
        cache_creation: 0,
        tokens_by_model: {},
      },
    ],
    isLoading: false,
  }),
}));

vi.mock('../hooks/useCostMetrics', () => ({
  useCostMetrics: () => ({
    totalCost: 1.5,
    getSessionCost: (session: { cost_usd: number }) => session.cost_usd,
  }),
}));

vi.mock('../stores/filterStore', () => ({
  useFilterStore: () => ({
    selectedProject: null,
    activeTimeRange: { kind: 'built_in', key: 'today' },
    selectedProvider: null,
  }),
}));

vi.mock('../stores/settingsStore', () => ({
  useSettingsStore: () => ({
    showCost: true,
  }),
}));

vi.mock('../components/layout/Header', () => ({
  Header: () => <div data-testid="report-header" />,
}));

vi.mock('../components/export/ExportButton', () => ({
  ExportButton: () => <button type="button">Export</button>,
}));

vi.mock('../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('Report', () => {
  beforeEach(() => {
    navigateMock.mockReset();
  });

  it('scales daily activity token and session bars independently without overflow', () => {
    render(<Report />);

    const firstDayTokenBar = screen.getByTestId('daily-token-bar-2026-03-30');
    const firstDaySessionBar = screen.getByTestId('daily-session-bar-2026-03-30');
    const secondDayTokenBar = screen.getByTestId('daily-token-bar-2026-03-31');
    const secondDaySessionBar = screen.getByTestId('daily-session-bar-2026-03-31');

    expect(firstDayTokenBar).toHaveStyle({ height: '100%' });
    expect(firstDaySessionBar).toHaveStyle({ height: '50%' });
    expect(secondDayTokenBar).toHaveStyle({ height: '22.22222222222222%' });
    expect(secondDaySessionBar).toHaveStyle({ height: '100%' });
  });
});
