import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import type { Statistics, ProjectInfo } from '../types/statistics';

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
    staleTime: 5 * 60 * 1000,
  });
}

export function useRefreshData() {
  return useQuery({
    queryKey: ['refresh'],
    queryFn: () => invoke<string>('refresh_data'),
    staleTime: 0,
    enabled: false,
  });
}
