import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useState, useEffect, useRef } from 'react';
import type { Statistics, ProjectInfo, SessionInfo, SessionMessage, InstructionInfo, FileChange, AccountUsageResult, ProviderUsage } from '../types/statistics';
import { useSettingsStore } from '../stores/settingsStore';
import { serializeTimeRangeForQuery, type ActiveTimeRange } from '../lib/timeRanges';

function normalizeSelection(values?: string[]) {
  return values && values.length > 0 ? values : null;
}

export function useProjects() {
  const enabledSources = useSettingsStore((s) => s.enabledSources);
  return useQuery<ProjectInfo[]>({
    queryKey: ['projects', enabledSources],
    queryFn: () => invoke<ProjectInfo[]>('get_projects', { enabledSources }),
    staleTime: 5 * 60 * 1000,
  });
}

export function useStatistics(projects: string[], activeRange: ActiveTimeRange, providerFilter?: string[]) {
  const customProviders = useSettingsStore((s) => s.customProviders);
  const enabledSources = useSettingsStore((s) => s.enabledSources);
  const savedRanges = useSettingsStore((s) => s.savedTimeRanges);
  const { timeRange, timeFilter, queryKey } = serializeTimeRangeForQuery(activeRange, savedRanges);
  const selectedProjects = normalizeSelection(projects);
  const selectedProviders = normalizeSelection(providerFilter);

  return useQuery<Statistics>({
    queryKey: ['statistics', selectedProjects, queryKey, selectedProviders, customProviders, enabledSources],
    queryFn: () => invoke<Statistics>('get_statistics', {
      project: selectedProjects,
      timeFilter,
      timeRange,
      providerFilter: selectedProviders,
      customProviders: customProviders.length > 0 ? customProviders : null,
      enabledSources,
    }),
    staleTime: 60 * 1000,
  });
}

export function useSessions(projects: string[], activeRange: ActiveTimeRange, providerFilter?: string[]) {
  const customProviders = useSettingsStore((s) => s.customProviders);
  const enabledSources = useSettingsStore((s) => s.enabledSources);
  const savedRanges = useSettingsStore((s) => s.savedTimeRanges);
  const { timeRange, timeFilter, queryKey } = serializeTimeRangeForQuery(activeRange, savedRanges);
  const selectedProjects = normalizeSelection(projects);
  const selectedProviders = normalizeSelection(providerFilter);

  return useQuery<SessionInfo[]>({
    queryKey: ['sessions', selectedProjects, queryKey, selectedProviders, customProviders, enabledSources],
    queryFn: () => invoke<SessionInfo[]>('get_sessions', {
      project: selectedProjects,
      timeFilter,
      timeRange,
      providerFilter: selectedProviders,
      customProviders: customProviders.length > 0 ? customProviders : null,
      enabledSources,
    }),
    staleTime: 60 * 1000,
  });
}

export function useSessionMessages(sessionId: string | null, source: string) {
  return useQuery<SessionMessage[]>({
    queryKey: ['session-messages', sessionId, source],
    queryFn: () => invoke<SessionMessage[]>('get_session_messages', { sessionId, source }),
    enabled: !!sessionId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useInstructions(projects: string[], activeRange: ActiveTimeRange, providerFilter?: string[]) {
  const customProviders = useSettingsStore((s) => s.customProviders);
  const enabledSources = useSettingsStore((s) => s.enabledSources);
  const savedRanges = useSettingsStore((s) => s.savedTimeRanges);
  const { timeRange, timeFilter, queryKey } = serializeTimeRangeForQuery(activeRange, savedRanges);
  const selectedProjects = normalizeSelection(projects);
  const selectedProviders = normalizeSelection(providerFilter);

  return useQuery<InstructionInfo[]>({
    queryKey: ['instructions', selectedProjects, queryKey, selectedProviders, customProviders, enabledSources],
    queryFn: () => invoke<InstructionInfo[]>('get_instructions', {
      project: selectedProjects,
      timeFilter,
      timeRange,
      providerFilter: selectedProviders,
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

export function useCodeChangesDetail(projects: string[], activeRange: ActiveTimeRange, providerFilter?: string[]) {
  const customProviders = useSettingsStore((s) => s.customProviders);
  const enabledSources = useSettingsStore((s) => s.enabledSources);
  const savedRanges = useSettingsStore((s) => s.savedTimeRanges);
  const { timeRange, timeFilter, queryKey } = serializeTimeRangeForQuery(activeRange, savedRanges);
  const selectedProjects = normalizeSelection(projects);
  const selectedProviders = normalizeSelection(providerFilter);

  return useQuery<FileChange[]>({
    queryKey: ['code-changes-detail', selectedProjects, queryKey, selectedProviders, customProviders, enabledSources],
    queryFn: () => invoke<FileChange[]>('get_code_changes_detail', {
      project: selectedProjects,
      timeFilter,
      timeRange,
      providerFilter: selectedProviders,
      customProviders: customProviders.length > 0 ? customProviders : null,
      enabledSources,
    }),
    staleTime: 60 * 1000,
  });
}

export function useAccountUsage() {
  const enabledSources = useSettingsStore((s) => s.enabledSources);
  const [streamingProviders, setStreamingProviders] = useState<ProviderUsage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const fetchIdRef = useRef(0);

  useEffect(() => {
    const unlisten = listen<ProviderUsage>('account-usage-provider-ready', (event) => {
      setStreamingProviders((prev) => {
        const key = event.payload.source + (event.payload.email || '');
        if (prev.some((p) => p.source + (p.email || '') === key)) return prev;
        return [...prev, event.payload];
      });
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  const query = useQuery<AccountUsageResult>({
    queryKey: ['account-usage', enabledSources],
    queryFn: async () => {
      const id = ++fetchIdRef.current;
      setStreamingProviders([]);
      setIsStreaming(true);
      const result = await invoke<AccountUsageResult>('get_account_usage', { enabledSources });
      if (fetchIdRef.current === id) {
        setIsStreaming(false);
      }
      return result;
    },
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });

  const providers = isStreaming || query.isLoading
    ? streamingProviders
    : (query.data?.providers || []);

  return {
    ...query,
    data: { providers } as AccountUsageResult,
    isStreaming,
  };
}
