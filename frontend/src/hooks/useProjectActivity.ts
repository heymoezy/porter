import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

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

  // SSE subscription for real-time updates
  useEffect(() => {
    if (!projectId) return;
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/events');
      const handler = (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          if (data.project_id === projectId) {
            const newEvent: ActivityEvent = {
              id: Date.now(), // temporary ID for SSE-pushed events
              agent_id: data.agent_id || '',
              agent_name: data.agent_name || 'Agent',
              agent_role: data.agent_role || '',
              agent_avatar: data.agent_avatar || '',
              job_id: data.job_id || null,
              event_type: data.event_type || 'unknown',
              summary: data.summary || '',
              detail: data.detail || null,
              created_at: data.created_at || Date.now() / 1000,
            };
            setEvents(prev => [newEvent, ...prev].slice(0, 100));
            setTotal(prev => prev + 1);
          }
        } catch { /* ignore parse errors */ }
      };
      es.addEventListener('project:activity', handler);
      es.addEventListener('agent:activity', handler);
      es.onerror = () => {
        // Reconnection is automatic with EventSource
        console.debug('[useProjectActivity] SSE reconnecting...');
      };
    } catch {
      console.debug('[useProjectActivity] SSE not available');
    }
    return () => { if (es) { es.close(); } };
  }, [projectId]);

  return { events, isLoading, total, refresh: fetchActivity };
}
