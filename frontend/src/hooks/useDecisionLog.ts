import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useSSEBus } from '../providers/SSEProvider';

export interface DecisionEntry {
  id: number;
  decision_type: 'model_selection' | 'agent_routing' | 'task_skip';
  chosen: string;
  reasoning: string;
  alternatives: string[];
  project_id: string | null;
  agent_id: string | null;
  job_id: string | null;
  created_at: number;
}

interface DecisionResponse {
  data: {
    decisions: DecisionEntry[];
    total: number;
    limit: number;
    offset: number;
  };
}

export function useDecisionLog(options?: { type?: string; limit?: number }) {
  const queryClient = useQueryClient();
  const bus = useSSEBus();
  const [offset, setOffset] = useState(0);
  const limit = options?.limit || 50;
  const type = options?.type || '';

  const queryKey = ['decisions', type, limit, offset];

  const query = useQuery({
    queryKey,
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(offset));
      if (type) params.set('type', type);
      return api<DecisionResponse>(`/api/v1/decisions?${params.toString()}`);
    },
    staleTime: 60_000, // 1 min -- decisions don't change rapidly
  });

  // SSE push -- invalidate on decision:made event
  useEffect(() => {
    const unsub = bus.subscribe('decision:made', () => {
      queryClient.invalidateQueries({ queryKey: ['decisions'] });
    });
    return () => { unsub(); };
  }, [bus, queryClient]);

  const decisions = query.data?.data?.decisions || [];
  const total = query.data?.data?.total || 0;

  return {
    decisions,
    total,
    isLoading: query.isLoading,
    error: query.error,
    offset,
    limit,
    setOffset,
    hasMore: offset + limit < total,
    refetch: query.refetch,
  };
}
