import { useQuery } from '@tanstack/react-query';
import { useSettings } from '../../../contexts/SettingsContext';
import { checkAllEndpoints } from '../api/healthChecks';

const QUERY_KEY = ['apiHealthChecks'];

/**
 * Polls all API endpoints via React Query.
 * Uses refreshInterval and autoRefresh from Settings when available.
 * Returns { endpoints, isLoading, error, refetch, lastCheck }.
 */
export function useApiHealthChecks() {
  const { generalSettings, refreshInterval } = useSettings();
  const autoRefresh = generalSettings?.autoRefresh ?? true;
  const pollIntervalMs = autoRefresh ? (refreshInterval ?? 30) * 1000 : false;

  const {
    data: endpoints = [],
    isLoading,
    error,
    refetch,
    dataUpdatedAt,
  } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: checkAllEndpoints,
    refetchInterval: pollIntervalMs,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
  });

  return {
    endpoints: Array.isArray(endpoints) ? endpoints : [],
    isLoading,
    error,
    refetch,
    lastCheck: dataUpdatedAt ? new Date(dataUpdatedAt) : null,
  };
}
