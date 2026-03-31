import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Dashboard } from './Dashboard';
import { CostBreakdown } from './CostBreakdown';
import { Sessions } from './Sessions';
import { Report } from './Report';
import { useSettingsStore } from '../stores/settingsStore';
import { useFilterStore } from '../stores/filterStore';
import { useAppStore } from '../stores/appStore';
import { usePricingStore } from '../stores/pricingStore';
import type { SessionInfo, Statistics, ModelTokens } from '../types/statistics';

const mockUseStatistics = vi.fn();
const mockUseSessions = vi.fn();
const invokeMock = vi.fn();

vi.mock('../hooks/useStatistics', () => ({
  useStatistics: (...args: unknown[]) => mockUseStatistics(...args),
  useSessions: (...args: unknown[]) => mockUseSessions(...args),
  useProjects: () => ({ data: [] }),
  useAvailableProviders: () => ({ data: [] }),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock('../components/layout/Header', () => ({
  Header: () => <div data-testid="header" />,
}));

vi.mock('../components/layout/Footer', () => ({
  Footer: () => <div data-testid="footer" />,
}));

vi.mock('../components/pages/SettingsPage', () => ({
  SettingsPage: () => <div data-testid="settings-page" />,
}));

vi.mock('../components/cards/StatCard', () => ({
  StatCard: ({ title, value }: { title: string; value: string }) => <div>{title}:{value}</div>,
}));

vi.mock('../components/charts/DevTimeChart', () => ({
  DevTimeChart: () => <div data-testid="dev-time-chart" />,
}));

vi.mock('../components/charts/CodeChanges', () => ({
  CodeChanges: () => <div data-testid="code-changes-chart" />,
}));

vi.mock('../components/charts/ToolUsageChart', () => ({
  ToolUsageChart: () => <div data-testid="tool-usage-chart" />,
}));

vi.mock('../components/charts/SkillUsageChart', () => ({
  SkillUsageChart: () => <div data-testid="skill-usage-chart" />,
}));

vi.mock('../components/charts/McpUsageChart', () => ({
  McpUsageChart: () => <div data-testid="mcp-usage-chart" />,
}));

vi.mock('../components/charts/TokenChart', () => ({
  TokenChart: ({ costByModel }: { costByModel: Record<string, number> }) => (
    <div data-testid="token-chart-costs">{JSON.stringify(costByModel)}</div>
  ),
}));

function makeModelTokens(
  input: number,
  output: number,
  cacheRead = 0,
  cacheCreation = 0,
  legacyCost = 0
): ModelTokens {
  return {
    input,
    output,
    cache_read: cacheRead,
    cache_creation: cacheCreation,
    cost_usd: legacyCost,
  };
}

function makeSession(options: {
  id: string;
  model: string;
  project?: string;
  source?: string;
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheCreation?: number;
  totalTokens?: number;
  legacyCost?: number;
  timestamp?: string;
}): SessionInfo {
  const {
    id,
    model,
    project = 'project-a',
    source = 'claude_code',
    input = 0,
    output = 0,
    cacheRead = 0,
    cacheCreation = 0,
    totalTokens = input + output + cacheRead + cacheCreation,
    legacyCost = 0,
    timestamp = '2026-03-23T09:00:00+08:00',
  } = options;

  return {
    session_id: id,
    project_name: project,
    timestamp,
    duration_ms: 60_000,
    duration_formatted: '1m',
    total_tokens: totalTokens,
    instructions: 1,
    model,
    git_branch: 'main',
    cost_usd: legacyCost,
    source,
    input,
    output,
    cache_read: cacheRead,
    cache_creation: cacheCreation,
    tokens_by_model: {
      [model]: makeModelTokens(input, output, cacheRead, cacheCreation, legacyCost),
    },
  };
}

function makeStatistics(options: {
  sessions: number;
  instructions: number;
  modelBuckets: Record<string, ModelTokens>;
  legacyCost: number;
}): Statistics {
  const { sessions, instructions, modelBuckets, legacyCost } = options;
  const totals = Object.values(modelBuckets).reduce(
    (acc, bucket) => {
      acc.input += bucket.input;
      acc.output += bucket.output;
      acc.cache_read += bucket.cache_read;
      acc.cache_creation += bucket.cache_creation;
      return acc;
    },
    { input: 0, output: 0, cache_read: 0, cache_creation: 0 }
  );

  return {
    sessions,
    instructions,
    duration_ms: 60_000 * sessions,
    duration_formatted: `${sessions}m`,
    tokens: {
      ...totals,
      by_model: modelBuckets,
    },
    code_changes: {
      total: { additions: 0, deletions: 0, files: 0 },
      by_extension: {},
    },
    dev_time: {
      total_ms: 60_000 * sessions,
      ai_time_ms: 30_000 * sessions,
      user_time_ms: 30_000 * sessions,
      ai_ratio: 0.5,
    },
    tool_usage: {},
    skill_usage: {},
    mcp_usage: {},
    cost_usd: legacyCost,
  };
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();

  useSettingsStore.setState({
    language: 'en',
    showCost: true,
    showSessionsCard: true,
    showInstructionsCard: true,
    showDurationCard: true,
    showTokensCard: true,
    showCostCard: true,
    showSkillsCard: false,
    showMcpCard: false,
    sessionSortField: 'cost_usd',
    sessionSortOrder: 'desc',
    customPricingEnabled: false,
    customPricing: {},
    customProviders: [],
    enabledSources: {
      claude_code: true,
      codex: true,
      gemini: true,
      opencode: true,
      openclaw: true,
    },
  });
  useFilterStore.setState({
    selectedProjects: [],
    activeTimeRange: { kind: 'built_in', key: 'today' },
    selectedProviders: [],
  });
  useAppStore.setState({ currentView: 'dashboard' });
  usePricingStore.setState({
    models: [
      {
        id: 'model-a',
        name: 'Model A',
        provider: 'test',
        input: 1,
        output: 2,
        cacheRead: 10,
        cacheWrite: 20,
      },
      {
        id: 'model-b',
        name: 'Model B',
        provider: 'test',
        input: 1.5,
        output: 2.5,
        cacheRead: 10,
        cacheWrite: 20,
      },
    ],
    lastFetched: null,
    isFetching: false,
    error: null,
  });
});

describe('cost-driven pages', () => {
  it('Dashboard shows derived cost while tray sync stays on global today totals', async () => {
    const filteredSessions = [makeSession({ id: 'filtered', model: 'model-a', input: 10_000_000, cacheRead: 2_000_000, legacyCost: 999 })];
    const filteredStats = makeStatistics({
      sessions: 1,
      instructions: 1,
      modelBuckets: { 'model-a': makeModelTokens(10_000_000, 0, 2_000_000, 0, 999) },
      legacyCost: 999,
    });

    const todaySessions = [
      makeSession({ id: 'today-a', model: 'model-a', input: 1_000_000, cacheRead: 500_000, legacyCost: 500 }),
      makeSession({ id: 'today-b', model: 'model-b', input: 0, output: 1_000_000, cacheCreation: 500_000, legacyCost: 500 }),
    ];
    const todayStats = makeStatistics({
      sessions: 2,
      instructions: 2,
      modelBuckets: {
        'model-a': makeModelTokens(1_000_000, 0, 500_000, 0, 500),
        'model-b': makeModelTokens(0, 1_000_000, 0, 500_000, 500),
      },
      legacyCost: 999,
    });

    useFilterStore.setState({
      selectedProjects: ['filtered-project'],
      activeTimeRange: { kind: 'built_in', key: 'week' },
      selectedProviders: ['OpenAI'],
    });

    mockUseStatistics.mockReturnValue({
      data: filteredStats,
      isLoading: false,
      refetch: vi.fn(),
      isRefetching: false,
    });
    mockUseSessions.mockReturnValue({
      data: filteredSessions,
      isLoading: false,
      refetch: vi.fn(),
      isRefetching: false,
    });

    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'get_statistics') return todayStats;
      if (command === 'get_sessions') return todaySessions;
      return null;
    });

    renderWithProviders(<Dashboard />);

    expect(screen.getByText('Cost:$10.00')).toBeInTheDocument();
    expect(screen.queryByText('$999.00')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        'get_statistics',
        expect.objectContaining({ project: null, providerFilter: null, timeFilter: 'today' })
      );
      expect(invokeMock).toHaveBeenCalledWith(
        'update_tray_stats',
        expect.objectContaining({
          stats: expect.objectContaining({
            costUsd: 3.5,
            sessions: 2,
            instructions: 2,
            totalTokens: 3_000_000,
          }),
        })
      );
    });
  });

  it('CostBreakdown renders billable totals separately from cache insight', () => {
    const sessions = [
      makeSession({ id: 's1', model: 'model-a', input: 1_000_000, legacyCost: 111 }),
      makeSession({ id: 's2', model: 'model-b', output: 1_000_000, cacheRead: 500_000, cacheCreation: 500_000, legacyCost: 222 }),
    ];
    const stats = makeStatistics({
      sessions: 2,
      instructions: 2,
      modelBuckets: {
        'model-a': makeModelTokens(1_000_000, 0, 0, 0, 111),
        'model-b': makeModelTokens(0, 1_000_000, 500_000, 500_000, 222),
      },
      legacyCost: 999,
    });

    mockUseStatistics.mockReturnValue({ data: stats, isLoading: false });
    mockUseSessions.mockReturnValue({ data: sessions, isLoading: false });

    const { container } = renderWithProviders(<CostBreakdown />);

    const scoped = within(container);
    const heading = scoped.getByRole('heading', { level: 2 });
    expect(heading.textContent).toContain('$3.50');
    expect(heading.textContent).not.toContain('$18.50');
    expect(screen.queryByText('$999.00')).not.toBeInTheDocument();
    expect(scoped.getAllByText(/Not included in total/)).toHaveLength(2);
    expect(scoped.getByText('$5.00')).toBeInTheDocument();
    expect(scoped.getByText('$10.00')).toBeInTheDocument();
    expect(scoped.getByTestId('cost-type-segment-input')).toBeInTheDocument();
    expect(scoped.getByTestId('cost-type-segment-output')).toBeInTheDocument();
    expect(scoped.queryByTestId('cost-type-segment-cache_read')).not.toBeInTheDocument();
    expect(scoped.queryByTestId('cost-type-segment-cache_creation')).not.toBeInTheDocument();
    expect(screen.getAllByText('$1.00').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('$2.50').length).toBeGreaterThanOrEqual(1);
  });

  it('CostBreakdown still shows cache insight when billable total is zero', () => {
    const sessions = [
      makeSession({ id: 'cache-only', model: 'model-b', cacheRead: 500_000, cacheCreation: 500_000 }),
    ];
    const stats = makeStatistics({
      sessions: 1,
      instructions: 1,
      modelBuckets: {
        'model-b': makeModelTokens(0, 0, 500_000, 500_000),
      },
      legacyCost: 999,
    });

    mockUseStatistics.mockReturnValue({ data: stats, isLoading: false });
    mockUseSessions.mockReturnValue({ data: sessions, isLoading: false });

    const { container } = renderWithProviders(<CostBreakdown />);

    const scoped = within(container);
    const heading = scoped.getByRole('heading', { level: 2 });
    expect(heading.textContent).toContain('$0.00');
    expect(scoped.queryByText('No cost data')).not.toBeInTheDocument();
    expect(scoped.getAllByText(/Not included in total/)).toHaveLength(2);
    expect(scoped.getByText('$5.00')).toBeInTheDocument();
    expect(scoped.getByText('$10.00')).toBeInTheDocument();
    expect(scoped.queryByTestId('cost-type-segment-input')).not.toBeInTheDocument();
    expect(scoped.queryByTestId('cost-type-segment-output')).not.toBeInTheDocument();
  });

  it('Sessions sorts and displays by derived session cost', () => {
    const cheaper = makeSession({ id: 'cheap', project: 'cheap-project', model: 'model-a', input: 1_000_000, cacheRead: 1_000_000, legacyCost: 999 });
    const expensive = makeSession({ id: 'expensive', project: 'expensive-project', model: 'model-b', input: 2_000_000, cacheCreation: 1_000_000, legacyCost: 1 });

    mockUseSessions.mockReturnValue({ data: [cheaper, expensive], isLoading: false });

    const { container } = renderWithProviders(<Sessions />);
    const firstRow = container.querySelector('tbody tr');

    expect(firstRow?.textContent).toContain('expensive-project');
    expect(screen.getByText('$3.00')).toBeInTheDocument();
    expect(screen.queryByText('$999.00')).not.toBeInTheDocument();
  });

  it('Report overview and project totals use derived costs', () => {
    const sessions = [
      makeSession({ id: 'r1', project: 'project-a', model: 'model-a', input: 1_000_000, cacheRead: 1_000_000, legacyCost: 700 }),
      makeSession({ id: 'r2', project: 'project-a', model: 'model-b', output: 1_000_000, cacheCreation: 1_000_000, legacyCost: 800, timestamp: '2026-03-24T09:00:00+08:00' }),
    ];
    const stats = makeStatistics({
      sessions: 2,
      instructions: 2,
      modelBuckets: {
        'model-a': makeModelTokens(1_000_000, 0, 1_000_000, 0, 700),
        'model-b': makeModelTokens(0, 1_000_000, 0, 1_000_000, 800),
      },
      legacyCost: 999,
    });

    mockUseStatistics.mockReturnValue({ data: stats, isLoading: false });
    mockUseSessions.mockReturnValue({ data: sessions, isLoading: false });

    renderWithProviders(<Report />);

    expect(screen.getAllByText('$3.50').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText('$999.00')).not.toBeInTheDocument();
    expect(screen.getByText('project-a')).toBeInTheDocument();
  });

  it('keeps Dashboard, CostBreakdown, Sessions, and Report on the same derived total', () => {
    const sessions = [
      makeSession({ id: 'shared-a', project: 'shared-project', model: 'model-a', input: 1_000_000, cacheRead: 1_000_000, legacyCost: 700 }),
      makeSession({ id: 'shared-b', project: 'shared-project', model: 'model-b', output: 1_000_000, cacheCreation: 1_000_000, legacyCost: 800, timestamp: '2026-03-24T09:00:00+08:00' }),
    ];
    const stats = makeStatistics({
      sessions: 2,
      instructions: 2,
      modelBuckets: {
        'model-a': makeModelTokens(1_000_000, 0, 1_000_000, 0, 700),
        'model-b': makeModelTokens(0, 1_000_000, 0, 1_000_000, 800),
      },
      legacyCost: 999,
    });

    mockUseStatistics.mockReturnValue({ data: stats, isLoading: false, refetch: vi.fn(), isRefetching: false });
    mockUseSessions.mockReturnValue({ data: sessions, isLoading: false, refetch: vi.fn(), isRefetching: false });

    const dashboard = renderWithProviders(<Dashboard />);
    expect(dashboard.getAllByText('Cost:$3.50').length).toBeGreaterThanOrEqual(1);
    dashboard.unmount();

    const breakdown = renderWithProviders(<CostBreakdown />);
    expect(within(breakdown.container).getByRole('heading', { level: 2 }).textContent).toContain('$3.50');
    breakdown.unmount();

    const sessionsView = renderWithProviders(<Sessions />);
    expect(sessionsView.getAllByText('$3.50').length).toBeGreaterThanOrEqual(1);
    sessionsView.unmount();

    const reportView = renderWithProviders(<Report />);
    expect(reportView.getAllByText('$3.50').length).toBeGreaterThanOrEqual(2);
  });
});
