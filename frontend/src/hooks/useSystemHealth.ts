import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from '../lib/api';
import { useSSEBus } from '../providers/SSEProvider';

export interface BackendStatus {
  name: string;
  url: string;
  model: string;
  status: 'up' | 'down' | 'unknown';
  latencyMs: number | null;
}

export interface TokenUsage {
  model: string;
  total_input: number;
  total_output: number;
  total_requests: number;
}

export interface HealthData {
  backends: BackendStatus[];
  database: { status: 'up' | 'down'; latencyMs: number | null };
  tokenUsage: TokenUsage[];
  checkedAt: string;
}

interface HealthResponse {
  data: HealthData;
}

export function useSystemHealth() {
  const queryClient = useQueryClient();
  const bus = useSSEBus();

  const query = useQuery({
    queryKey: ['system-health'],
    queryFn: () => api<HealthResponse>('/api/v1/health'),
    refetchInterval: 30_000, // 30s fallback polling
    staleTime: 15_000,
  });

  // SSE push -- invalidate on system:health event
  useEffect(() => {
    const unsub = bus.subscribe('system:health', () => {
      queryClient.invalidateQueries({ queryKey: ['system-health'] });
    });
    return () => { unsub(); };
  }, [bus, queryClient]);

  return {
    health: query.data?.data || null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
