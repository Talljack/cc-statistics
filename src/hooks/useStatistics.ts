import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import type { Statistics, ProjectInfo, SessionInfo, InstructionInfo } from '../types/statistics';

export function useProjects() {
  return useQuery<ProjectInfo[]>({
    queryKey: ['projects'],
    queryFn: () => invoke<ProjectInfo[]>('get_projects'),
    staleTime: 5 * 60 * 1000,
  });
}

export function useStatistics(project: string | null, timeFilter: string, providerFilter?: string | null) {
  return useQuery<Statistics>({
    queryKey: ['statistics', project, timeFilter, providerFilter ?? null],
    queryFn: () => invoke<Statistics>('get_statistics', {
      project,
      timeFilter,
      providerFilter: providerFilter ?? null,
    }),
    staleTime: 60 * 1000,
  });
}

export function useSessions(project: string | null, timeFilter: string, providerFilter?: string | null) {
  return useQuery<SessionInfo[]>({
    queryKey: ['sessions', project, timeFilter, providerFilter ?? null],
    queryFn: () => invoke<SessionInfo[]>('get_sessions', {
      project,
      timeFilter,
      providerFilter: providerFilter ?? null,
    }),
    staleTime: 60 * 1000,
  });
}

export function useInstructions(project: string | null, timeFilter: string, providerFilter?: string | null) {
  return useQuery<InstructionInfo[]>({
    queryKey: ['instructions', project, timeFilter, providerFilter ?? null],
    queryFn: () => invoke<InstructionInfo[]>('get_instructions', {
      project,
      timeFilter,
      providerFilter: providerFilter ?? null,
    }),
    staleTime: 60 * 1000,
  });
}

export function useAvailableProviders() {
  return useQuery<string[]>({
    queryKey: ['available-providers'],
    queryFn: () => invoke<string[]>('get_available_providers'),
    staleTime: 5 * 60 * 1000,
  });
}
