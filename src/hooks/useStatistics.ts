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

export function useStatistics(project: string | null, timeFilter: string) {
  return useQuery<Statistics>({
    queryKey: ['statistics', project, timeFilter],
    queryFn: () => invoke<Statistics>('get_statistics', {
      project,
      timeFilter,
    }),
    staleTime: 60 * 1000,
  });
}

export function useSessions(project: string | null, timeFilter: string) {
  return useQuery<SessionInfo[]>({
    queryKey: ['sessions', project, timeFilter],
    queryFn: () => invoke<SessionInfo[]>('get_sessions', {
      project,
      timeFilter,
    }),
    staleTime: 60 * 1000,
  });
}

export function useInstructions(project: string | null, timeFilter: string) {
  return useQuery<InstructionInfo[]>({
    queryKey: ['instructions', project, timeFilter],
    queryFn: () => invoke<InstructionInfo[]>('get_instructions', {
      project,
      timeFilter,
    }),
    staleTime: 60 * 1000,
  });
}
