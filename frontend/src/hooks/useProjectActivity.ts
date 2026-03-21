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

export interface QueuedJob {
  id: string;
  agent_id: string;
  agent_name: string;
  prompt: string | null;
  trigger_type: string;
  scheduled_for: number;
}

export interface CategorizedActivity {
  active: ActivityEvent[];    // event_type contains 'started' or 'wizard_start'
  completed: ActivityEvent[]; // event_type contains 'complete' or 'failed' or 'retired' (today only)
  queued: QueuedJob[];        // pending jobs from /api/v1/jobs
}

interface ActivityResponse {
  data: {
    events: ActivityEvent[];
    total: number;
    limit: number;
    offset: number;
  };
}

function categorizeEvents(events: ActivityEvent[]): Pick<CategorizedActivity, 'active' | 'completed'> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayUnix = todayStart.getTime() / 1000;

  const active: ActivityEvent[] = [];
  const completed: ActivityEvent[] = [];

  for (const event of events) {
    if (event.event_type === 'job_started' || event.event_type === 'wizard_start') {
      active.push(event);
    } else if (
      event.event_type === 'job_complete' ||
      event.event_type === 'job_failed' ||
      event.event_type === 'agent_retired'
    ) {
      // Only show today's completed events in the Completed section
      if (event.created_at >= todayUnix) {
        completed.push(event);
      }
    }
  }
  return { active, completed };
}

export function useProjectActivity(projectId: string | null) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [queuedJobs, setQueuedJobs] = useState<QueuedJob[]>([]);
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

  const fetchQueued = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await api<{ data: { jobs: QueuedJob[] } }>(`/api/v1/jobs?status=pending&limit=20`);
      // Filter client-side: include all pending jobs (scheduler handles project assignment)
      setQueuedJobs(res.data.jobs.filter((j: QueuedJob) => !!j.agent_id));
    } catch {
      // Non-critical -- queued section shows empty if fetch fails
    }
  }, [projectId]);

  useEffect(() => {
    fetchActivity();
    fetchQueued();
  }, [fetchActivity, fetchQueued]);

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
    const unsub3 = bus.subscribe('agent:status', () => { fetchQueued(); });
    return () => { unsub1(); unsub2(); unsub3(); };
  }, [projectId, bus, fetchQueued]);

  const categorized: CategorizedActivity = {
    ...categorizeEvents(events),
    queued: queuedJobs,
  };

  return { events, categorized, isLoading, total, refresh: fetchActivity };
}
