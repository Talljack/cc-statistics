import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SettingsPage } from './SettingsPage';
import { usePricingStore } from '../../stores/pricingStore';
import { buildDefaultSourceInstances, useSettingsStore } from '../../stores/settingsStore';
import type { PricingCatalogResult } from '../../types/pricing';

const invokeMock = vi.fn();
const getVersionMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock('@tauri-apps/api/app', () => ({
  getVersion: (...args: unknown[]) => getVersionMock(...args),
}));

vi.mock('../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../../hooks/useStatistics', () => ({
  useDetectSources: () => ({ data: [] }),
  usePresetModels: () => ({ data: [] }),
}));

vi.mock('../../stores/updateStore', () => ({
  useUpdateStore: () => ({
    status: 'idle',
    checkForUpdate: vi.fn(),
    setDialogOpen: vi.fn(),
    currentVersion: '0.2.7',
    error: null,
  }),
}));

vi.mock('../settings/TimeRangeManagementSection', () => ({
  TimeRangeManagementSection: () => <div data-testid="time-range-management" />,
}));

function makeCatalog(overrides: Partial<PricingCatalogResult> = {}): PricingCatalogResult {
  return {
    providers: [
      {
        billing_provider: 'openrouter',
        upstream_provider: null,
        status: 'ok',
        stale: false,
        errors: [],
        model_count: 1,
        source_kind: 'official_api',
        source_url: 'https://openrouter.ai/api/v1/models',
        fetched_at: '2026-03-27T00:00:00Z',
      },
    ],
    models: [
      {
        billing_provider: 'openrouter',
        upstream_provider: 'anthropic',
        model_id: 'anthropic/claude-sonnet-4-5',
        normalized_model_id: 'claude-sonnet-4-5',
        alias_keys: ['claude-sonnet-4-5'],
        input_per_m: 3,
        output_per_m: 15,
        cache_read_per_m: 0.3,
        cache_write_per_m: 3.75,
        source_kind: 'official_api',
        source_url: 'https://openrouter.ai/api/v1/models',
        resolved_from: 'openrouter',
        fetched_at: '2026-03-27T00:00:00Z',
      },
    ],
    fetched_at: '2026-03-27T00:00:00Z',
    expires_at: '2026-03-28T00:00:00Z',
    stale: false,
    errors: [],
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  getVersionMock.mockResolvedValue('0.2.7');

  useSettingsStore.setState({
    language: 'en',
    theme: 'dark',
    defaultTimeRange: { kind: 'built_in', key: 'today' },
    showCost: true,
    showToolUsage: false,
    showSkillUsage: true,
    showMcpUsage: false,
    autoRefreshEnabled: false,
    autoRefreshInterval: 5,
    alertsEnabled: false,
    dailyCostLimit: 0,
    dailyTokenLimit: 0,
    sessionWindowWarning: 80,
    alertsMutedUntil: null,
    showSessionsCard: true,
    showInstructionsCard: true,
    showDurationCard: true,
    showTokensCard: true,
    showCostCard: true,
    showSkillsCard: false,
    showMcpCard: false,
    sessionSortField: 'timestamp',
    sessionSortOrder: 'desc',
    customPricingEnabled: false,
    customPricing: {},
    customPricingModels: [],
    savedTimeRanges: [],
    customProviders: [],
    enabledSources: {
      claude_code: true,
      codex: true,
      gemini: true,
      opencode: true,
      openclaw: true,
      hermes: true,
    },
    sourceInstances: buildDefaultSourceInstances(),
  });

  usePricingStore.setState({
    catalog: null,
    providers: [],
    models: [],
    lastFetched: null,
    expiresAt: null,
    stale: false,
    isFetching: false,
    error: null,
  });
});

describe('SettingsPage alert settings', () => {
  it('renders the alert settings section in the General tab', () => {
    render(<SettingsPage />);

    const alertSection = screen.getAllByText('settings.alerts.title')[0]?.closest('section');
    expect(alertSection).not.toBeNull();
    if (!alertSection) throw new Error('Alert settings section not found');

    expect(within(alertSection).getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    expect(within(alertSection).queryByLabelText('settings.alerts.dailyCost')).not.toBeInTheDocument();
  });

  it('updates alert settings through the General tab controls', () => {
    render(<SettingsPage />);

    const alertSection = screen.getAllByText('settings.alerts.title')[0]?.closest('section');
    expect(alertSection).not.toBeNull();
    if (!alertSection) throw new Error('Alert settings section not found');

    fireEvent.click(within(alertSection).getByRole('switch'));
    expect(useSettingsStore.getState().alertsEnabled).toBe(true);

    fireEvent.change(within(alertSection).getByLabelText('settings.alerts.dailyCost'), {
      target: { value: '25' },
    });
    expect(useSettingsStore.getState().dailyCostLimit).toBe(25);

    fireEvent.change(within(alertSection).getByLabelText('settings.alerts.dailyTokens'), {
      target: { value: '150000' },
    });
    expect(useSettingsStore.getState().dailyTokenLimit).toBe(150000);

    fireEvent.change(within(alertSection).getByLabelText('settings.alerts.sessionWindow'), {
      target: { value: '90' },
    });
    expect(useSettingsStore.getState().sessionWindowWarning).toBe(90);
  });
});

describe('SettingsPage pricing catalog integration', () => {
  it('fetchPricing loads the pricing catalog through Tauri and surfaces healthy snapshot metadata in Settings', async () => {
    const catalog = makeCatalog();
    invokeMock.mockResolvedValueOnce(catalog);

    await usePricingStore.getState().fetchPricing();

    expect(invokeMock).toHaveBeenCalledWith('get_pricing_catalog', { forceRefresh: false });
    expect(usePricingStore.getState()).toMatchObject({
      catalog,
      providers: catalog.providers,
      lastFetched: catalog.fetched_at,
      expiresAt: catalog.expires_at,
      stale: false,
      error: null,
    });
    expect(usePricingStore.getState().error).toBeNull();
    expect(usePricingStore.getState().models).toEqual([
      expect.objectContaining({
        id: 'anthropic/claude-sonnet-4-5',
        name: 'anthropic/claude-sonnet-4-5',
        provider: 'openrouter',
        input: 3,
        output: 15,
        cacheRead: 0.3,
        cacheWrite: 3.75,
      }),
    ]);

    render(<SettingsPage />);
    fireEvent.click(screen.getAllByRole('button', { name: 'settings.tabs.advanced' })[0]);
    expect(screen.getByText(/1 settings\.pricing\.models/)).toBeInTheDocument();
    expect(screen.getByText(/settings\.pricing\.expires/)).toBeInTheDocument();
    expect(screen.queryByText(/settings\.pricing\.stale/)).not.toBeInTheDocument();
    expect(screen.queryByText(/settings\.pricing\.refreshFailedFallback/)).not.toBeInTheDocument();
  });

  it('shows a not fetched state before any pricing catalog exists', () => {
    render(<SettingsPage />);
    fireEvent.click(screen.getAllByRole('button', { name: 'settings.tabs.advanced' })[0]);

    expect(screen.getByText('settings.pricing.notFetched')).toBeInTheDocument();
  });

  it('renders a stale cache indicator when the cached catalog is stale', () => {
    const catalog = makeCatalog({ stale: true });
    usePricingStore.setState({
      catalog,
      providers: catalog.providers,
      models: [
        {
          id: 'anthropic/claude-sonnet-4-5',
          name: 'anthropic/claude-sonnet-4-5',
          provider: 'openrouter',
          input: 3,
          output: 15,
          cacheRead: 0.3,
          cacheWrite: 3.75,
          billingProvider: 'openrouter',
          upstreamProvider: 'anthropic',
          aliasKeys: ['claude-sonnet-4-5'],
          sourceKind: 'official_api',
          resolvedFrom: 'openrouter',
        },
      ],
      lastFetched: '2026-03-27T00:00:00Z',
      expiresAt: '2026-03-28T00:00:00Z',
      stale: true,
      error: null,
      isFetching: false,
    });

    render(<SettingsPage />);
    fireEvent.click(screen.getAllByRole('button', { name: 'settings.tabs.advanced' })[0]);

    expect(screen.getByText(/settings\.pricing\.stale/)).toBeInTheDocument();
    expect(screen.getByText(/settings\.pricing\.expires/)).toBeInTheDocument();
  });

  it('manual refresh uses the refresh command, shows fetching state, and preserves previous models on failure', async () => {
    usePricingStore.setState({
      catalog: makeCatalog(),
      providers: makeCatalog().providers,
      models: [
        {
          id: 'anthropic/claude-sonnet-4-5',
          name: 'anthropic/claude-sonnet-4-5',
          provider: 'openrouter',
          input: 3,
          output: 15,
          cacheRead: 0.3,
          cacheWrite: 3.75,
        },
      ],
      lastFetched: '2026-03-27T00:00:00Z',
      expiresAt: '2026-03-28T00:00:00Z',
      stale: false,
      error: null,
      isFetching: false,
    });

    const refresh = deferred<PricingCatalogResult>();
    invokeMock.mockImplementationOnce(async (command: string) => {
      expect(command).toBe('refresh_pricing_catalog');
      return refresh.promise;
    });

    render(<SettingsPage />);
    fireEvent.click(screen.getAllByRole('button', { name: 'settings.tabs.advanced' })[0]);

    const refreshButton = screen.getByRole('button', { name: 'settings.pricing.refresh' });
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('refresh_pricing_catalog');
      expect(screen.getByRole('button', { name: 'settings.pricing.fetching' })).toBeDisabled();
    });

    refresh.reject(new Error('refresh failed'));

    await waitFor(() => {
      expect(usePricingStore.getState().error).toBe('refresh failed');
      expect(usePricingStore.getState().models).toHaveLength(1);
      expect(screen.getByText(/1 settings\.pricing\.models/)).toBeInTheDocument();
      expect(screen.getByText('refresh failed')).toBeInTheDocument();
      expect(screen.getByText('settings.pricing.refreshFailedFallback')).toBeInTheDocument();
    });
  });
});
