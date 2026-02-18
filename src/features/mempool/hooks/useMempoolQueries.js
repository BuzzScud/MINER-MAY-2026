import { useQuery } from '@tanstack/react-query';
import {
  fetchRecommendedFees,
  fetchPrices,
  fetchDifficultyAdjustment,
  fetchMempool,
  fetchMempoolRecent,
  fetchMempoolRbf,
  fetchRecentBlocks,
} from '../api/mempool';

export function useRecommendedFees() {
  return useQuery({
    queryKey: ['recommendedFees'],
    queryFn: fetchRecommendedFees,
    refetchInterval: 30_000,
  });
}

export function usePrices() {
  return useQuery({
    queryKey: ['prices'],
    queryFn: fetchPrices,
    refetchInterval: 60_000,
  });
}

export function useDifficultyAdjustment() {
  return useQuery({
    queryKey: ['difficultyAdjustment'],
    queryFn: fetchDifficultyAdjustment,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
  });
}

export function useMempoolStats() {
  return useQuery({
    queryKey: ['mempoolStats'],
    queryFn: fetchMempool,
    refetchInterval: 15_000,
  });
}

export function useMempoolRecent() {
  return useQuery({
    queryKey: ['mempoolRecent'],
    queryFn: fetchMempoolRecent,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
  });
}

export function useMempoolRbf() {
  return useQuery({
    queryKey: ['mempoolRbf'],
    queryFn: fetchMempoolRbf,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
  });
}

export function useRecentBlocks(startHeight) {
  return useQuery({
    queryKey: ['recentBlocks', startHeight ?? 'tip'],
    queryFn: () => fetchRecentBlocks(startHeight),
    refetchInterval: 35_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
  });
}
