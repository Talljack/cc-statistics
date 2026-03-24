import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import type { Statistics, ProjectInfo, SessionInfo, InstructionInfo, FileChange, AccountUsageResult } from '../types/statistics';
import { useSettingsStore } from '../stores/settingsStore';
import { serializeTimeRangeForQuery, type ActiveTimeRange } from '../lib/timeRanges';

export function useProjects() {
  const enabledSources = useSettingsStore((s) => s.enabledSources);
  return useQuery<ProjectInfo[]>({
    queryKey: ['projects', enabledSources],
    queryFn: () => invoke<ProjectInfo[]>('get_projects', { enabledSources }),
    staleTime: 5 * 60 * 1000,
  });
}

export function useStatistics(project: string | null, activeRange: ActiveTimeRange, providerFilter?: string | null) {
  const customProviders = useSettingsStore((s) => s.customProviders);
  const enabledSources = useSettingsStore((s) => s.enabledSources);
  const savedRanges = useSettingsStore((s) => s.savedTimeRanges);
  const { timeRange, timeFilter, queryKey } = serializeTimeRangeForQuery(activeRange, savedRanges);

  return useQuery<Statistics>({
    queryKey: ['statistics', project, queryKey, providerFilter ?? null, customProviders, enabledSources],
    queryFn: () => invoke<Statistics>('get_statistics', {
      project,
      timeFilter,
      timeRange,
      providerFilter: providerFilter ?? null,
      customProviders: customProviders.length > 0 ? customProviders : null,
      enabledSources,
    }),
    staleTime: 60 * 1000,
  });
}

export function useSessions(project: string | null, activeRange: ActiveTimeRange, providerFilter?: string | null) {
  const customProviders = useSettingsStore((s) => s.customProviders);
  const enabledSources = useSettingsStore((s) => s.enabledSources);
  const savedRanges = useSettingsStore((s) => s.savedTimeRanges);
  const { timeRange, timeFilter, queryKey } = serializeTimeRangeForQuery(activeRange, savedRanges);

  return useQuery<SessionInfo[]>({
    queryKey: ['sessions', project, queryKey, providerFilter ?? null, customProviders, enabledSources],
    queryFn: () => invoke<SessionInfo[]>('get_sessions', {
      project,
      timeFilter,
      timeRange,
      providerFilter: providerFilter ?? null,
      customProviders: customProviders.length > 0 ? customProviders : null,
      enabledSources,
    }),
    staleTime: 60 * 1000,
  });
}

export function useInstructions(project: string | null, activeRange: ActiveTimeRange, providerFilter?: string | null) {
  const customProviders = useSettingsStore((s) => s.customProviders);
  const enabledSources = useSettingsStore((s) => s.enabledSources);
  const savedRanges = useSettingsStore((s) => s.savedTimeRanges);
  const { timeRange, timeFilter, queryKey } = serializeTimeRangeForQuery(activeRange, savedRanges);

  return useQuery<InstructionInfo[]>({
    queryKey: ['instructions', project, queryKey, providerFilter ?? null, customProviders, enabledSources],
    queryFn: () => invoke<InstructionInfo[]>('get_instructions', {
      project,
      timeFilter,
      timeRange,
      providerFilter: providerFilter ?? null,
      customProviders: customProviders.length > 0 ? customProviders : null,
      enabledSources,
    }),
    staleTime: 60 * 1000,
  });
}

export function useAvailableProviders() {
  const customProviders = useSettingsStore((s) => s.customProviders);
  const enabledSources = useSettingsStore((s) => s.enabledSources);
  return useQuery<string[]>({
    queryKey: ['available-providers', customProviders, enabledSources],
    queryFn: () => invoke<string[]>('get_available_providers', {
      customProviders: customProviders.length > 0 ? customProviders : null,
      enabledSources,
    }),
    staleTime: 5 * 60 * 1000,
  });
}

export function useDetectSources() {
  return useQuery<[string, boolean][]>({
    queryKey: ['detect-sources'],
    queryFn: () => invoke<[string, boolean][]>('detect_sources'),
    staleTime: 60 * 60 * 1000,
  });
}

export function usePresetModels() {
  return useQuery<string[]>({
    queryKey: ['preset-models'],
    queryFn: () => invoke<string[]>('get_preset_models'),
    staleTime: 24 * 60 * 60 * 1000,
  });
}

export function useCodeChangesDetail(project: string | null, activeRange: ActiveTimeRange, providerFilter?: string | null) {
  const customProviders = useSettingsStore((s) => s.customProviders);
  const enabledSources = useSettingsStore((s) => s.enabledSources);
  const savedRanges = useSettingsStore((s) => s.savedTimeRanges);
  const { timeRange, timeFilter, queryKey } = serializeTimeRangeForQuery(activeRange, savedRanges);

  return useQuery<FileChange[]>({
    queryKey: ['code-changes-detail', project, queryKey, providerFilter ?? null, customProviders, enabledSources],
    queryFn: () => invoke<FileChange[]>('get_code_changes_detail', {
      project,
      timeFilter,
      timeRange,
      providerFilter: providerFilter ?? null,
      customProviders: customProviders.length > 0 ? customProviders : null,
      enabledSources,
    }),
    staleTime: 60 * 1000,
  });
}

export function useAccountUsage() {
  const enabledSources = useSettingsStore((s) => s.enabledSources);
  return useQuery<AccountUsageResult>({
    queryKey: ['account-usage', enabledSources],
    queryFn: () => invoke<AccountUsageResult>('get_account_usage', { enabledSources }),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
}
