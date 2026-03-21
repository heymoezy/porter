import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { useSSEBus } from '../providers/SSEProvider';

export interface ActivityEvent {
  id: number;
  agent_id: string;
  agent_name: string;
  agent_role: string;
  agent_avatar: string;
  job_id: string | null;
  event_type: string;
  summary: string;
  detail: unknown;
  created_at: number;
}

interface ActivityResponse {
  data: {
    events: ActivityEvent[];
    total: number;
    limit: number;
    offset: number;
  };
}

export function useProjectActivity(projectId: string | null) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const bus = useSSEBus();

  // Initial fetch
  const fetchActivity = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    try {
      const res = await api<ActivityResponse>(`/api/v1/projects/${projectId}/activity?limit=50`);
      setEvents(res.data.events);
      setTotal(res.data.total);
    } catch (e) {
      console.error('Failed to fetch activity:', e);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  // SSE subscription via shared SSEProvider -- no per-component EventSource
  useEffect(() => {
    if (!projectId) return;

    const handler = (payload: unknown) => {
      const data = payload as Record<string, unknown>;
      // Filter for project-specific events using data.data or top-level fields
      const eventData = (data.data || data) as Record<string, unknown>;
      if (eventData.project_id !== projectId) return;

      const newEvent: ActivityEvent = {
        id: Date.now(),
        agent_id: String(eventData.agent_id || ''),
        agent_name: String(eventData.agent_name || 'Agent'),
        agent_role: String(eventData.agent_role || ''),
        agent_avatar: String(eventData.agent_avatar || ''),
        job_id: eventData.job_id ? String(eventData.job_id) : null,
        event_type: String(eventData.event_type || 'unknown'),
        summary: String(eventData.summary || ''),
        detail: eventData.detail || null,
        created_at: Number(eventData.created_at) || Date.now() / 1000,
      };
      setEvents(prev => [newEvent, ...prev].slice(0, 100));
      setTotal(prev => prev + 1);
    };

    const unsub1 = bus.subscribe('project:activity', handler);
    const unsub2 = bus.subscribe('agent:activity', handler);
    return () => { unsub1(); unsub2(); };
  }, [projectId, bus]);

  return { events, isLoading, total, refresh: fetchActivity };
}
