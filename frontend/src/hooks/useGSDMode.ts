import { useCallback } from 'react';
import { useAppStore } from '../store/app';
import { api } from '../lib/api';

interface GSDDispatchResponse {
  data: {
    dispatched: boolean;
    jobsCreated: number;
    agentNames: string[];
    summary: string; // e.g. "Dispatched research task to Writer and analysis task to Analyst"
  };
}

export function useGSDMode(projectId: string | null) {
  const gsdModes = useAppStore(s => s.gsdModes);
  const setGsdMode = useAppStore(s => s.setGsdMode);
  const isGSD = projectId ? (gsdModes[projectId] ?? false) : false;

  const toggle = useCallback(() => {
    if (!projectId) return;
    setGsdMode(projectId, !isGSD);
  }, [projectId, isGSD, setGsdMode]);

  // Route a message through GSD flow — Porter orchestrates via agent_jobs, never responds directly
  const routeGSD = useCallback(async (message: string): Promise<string | null> => {
    if (!projectId || !isGSD) return null;
    try {
      // GSD mode sends to the gsd_dispatch action which:
      // 1. Calls Porter LLM with orchestration prompt to determine which agents should handle the task
      // 2. Creates agent_jobs entries for each dispatched task
      // 3. Returns a summary of what was dispatched (NOT Porter's direct answer)
      const res = await api<GSDDispatchResponse>(
        '/api/v1/projects/wizard',
        {
          json: {
            action: 'gsd_dispatch',
            projectId,
            message,
          },
        },
      );
      if (res.data.dispatched) {
        return res.data.summary;
      }
      return 'Porter is analyzing the request...';
    } catch {
      return null; // Fall back to regular chat
    }
  }, [projectId, isGSD]);

  return { isGSD, toggle, routeGSD };
}
