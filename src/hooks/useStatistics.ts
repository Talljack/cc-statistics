import { useMutation, useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import type { Statistics, ProjectInfo } from '../types/statistics';

export function useProjects() {
  return useQuery<ProjectInfo[]>({
    queryKey: ['projects'],
    queryFn: () => invoke<ProjectInfo[]>('get_projects'),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useStatistics(project: string | null, timeFilter: string) {
  return useQuery<Statistics>({
    queryKey: ['statistics', project, timeFilter],
    queryFn: () => invoke<Statistics>('get_statistics', {
      project,
      timeFilter,
    }),
    staleTime: 60 * 1000, // 1 minute
  });
}

export function useCacheStatus() {
  return useQuery<string>({
    queryKey: ['cache-status'],
    queryFn: () => invoke<string>('get_cache_status'),
    staleTime: 5 * 60 * 1000,
  });
}

export function useRefreshData() {
  return useMutation({
    mutationFn: () => invoke<string>('refresh_data'),
  });
}
