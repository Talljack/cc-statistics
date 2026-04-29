import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildDefaultSourceInstances,
  DEFAULT_SOURCE_ROOTS,
  migrateSettingsState,
  useSettingsStore,
} from './settingsStore';

describe('settingsStore source instances', () => {
  beforeEach(() => {
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
  });

  it('migrates toggle-only persisted settings into built-in source instances', () => {
    const migrated = migrateSettingsState({
      enabledSources: {
        claude_code: false,
        codex: true,
        gemini: false,
        opencode: true,
        openclaw: true,
        hermes: true,
      },
    });

    expect(migrated.enabledSources).toMatchObject({
      claude_code: false,
      codex: true,
      gemini: false,
      opencode: true,
      openclaw: true,
      hermes: true,
    });
    expect(migrated.sourceInstances).toHaveLength(6);
    expect(migrated.sourceInstances).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'built-in:codex',
        source: 'codex',
        label: 'Default',
        rootPath: DEFAULT_SOURCE_ROOTS.codex,
        enabled: true,
        builtIn: true,
      }),
      expect.objectContaining({
        id: 'built-in:claude_code',
        source: 'claude_code',
        rootPath: DEFAULT_SOURCE_ROOTS.claude_code,
        builtIn: true,
      }),
      expect.objectContaining({
        id: 'built-in:hermes',
        source: 'hermes',
        rootPath: DEFAULT_SOURCE_ROOTS.hermes,
        builtIn: true,
      }),
    ]));
  });

  it('adds and updates a custom source instance and rejects duplicate roots for the same source', () => {
    const added = useSettingsStore.getState().addSourceInstance({
      source: 'codex',
      rootPath: '~/.codex-one/',
      label: 'Work',
    });

    expect(added).toBe(true);

    const custom = useSettingsStore.getState().sourceInstances.find((instance) => (
      instance.source === 'codex' && instance.builtIn === false
    ));
    expect(custom).toMatchObject({
      label: 'Work',
      rootPath: '~/.codex-one',
      enabled: true,
      builtIn: false,
    });

    const duplicate = useSettingsStore.getState().addSourceInstance({
      source: 'codex',
      rootPath: '~/.codex-one',
      label: 'Duplicate',
    });
    expect(duplicate).toBe(false);

    const renamed = useSettingsStore.getState().updateSourceInstance(custom!.id, {
      label: 'Work Profile',
      enabled: false,
    });
    expect(renamed).toBe(true);

    const updated = useSettingsStore.getState().sourceInstances.find((instance) => instance.id === custom!.id);
    expect(updated).toMatchObject({
      label: 'Work Profile',
      enabled: false,
      rootPath: '~/.codex-one',
    });
  });

  it('prevents duplicate roots on update and allows removing only custom instances', () => {
    const store = useSettingsStore.getState();
    expect(store.addSourceInstance({
      source: 'codex',
      rootPath: '~/.codex-one',
      label: 'One',
    })).toBe(true);
    expect(useSettingsStore.getState().addSourceInstance({
      source: 'codex',
      rootPath: '~/.codex-two',
      label: 'Two',
    })).toBe(true);

    const customInstances = useSettingsStore.getState().sourceInstances.filter((instance) => (
      instance.source === 'codex' && instance.builtIn === false
    ));
    expect(customInstances).toHaveLength(2);

    const conflict = useSettingsStore.getState().updateSourceInstance(customInstances[1].id, {
      rootPath: '~/.codex-one',
    });
    expect(conflict).toBe(false);

    useSettingsStore.getState().removeSourceInstance(customInstances[0].id);
    expect(useSettingsStore.getState().sourceInstances.some((instance) => instance.id === customInstances[0].id)).toBe(false);

    useSettingsStore.getState().removeSourceInstance('built-in:codex');
    expect(useSettingsStore.getState().sourceInstances.some((instance) => instance.id === 'built-in:codex')).toBe(true);
  });
});
