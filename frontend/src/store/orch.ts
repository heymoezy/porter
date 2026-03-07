import { create } from 'zustand';
import { api } from '../lib/api';

export interface Agent {
  id: string;
  name: string;
  type: string;
  role: string;
  last_seen: string | null;
  key_hash?: string;
  raw_key?: string;
  model_id?: string;
}

export interface Usage {
  agent_id: string;
  status: 'available' | 'degraded' | 'rate_limited' | 'exhausted' | 'unknown';
  usage_percent: number | string | null;
  window_resets_at: string | null;
  captured_at: string | null;
}

export interface AiProvider {
  id: string;
  label: string;
  features: string[];
  ok: boolean;
  version?: string;
}

interface OrchState {
  agents: Agent[];
  usage: Record<string, Usage>;
  providers: AiProvider[];
  isLoading: boolean;
  error: string | null;

  fetchData: () => Promise<void>;
  testConnection: (agentId: string) => Promise<any>;
  refreshUsage: () => Promise<void>;
}

export const useOrchStore = create<OrchState>((set, get) => ({
  agents: [],
  usage: {},
  providers: [],
  isLoading: false,
  error: null,

  fetchData: async () => {
    set({ isLoading: true });
    try {
      const [agentsData, usageData, providersData] = await Promise.all([
        api<{ agents: Agent[] }>('/api/agents'),
        api<{ agents: Usage[] }>('/agent-usage/current'),
        api<{ providers: AiProvider[] }>('/api/ai-providers'),
      ]);

      const usageMap: Record<string, Usage> = {};
      if (usageData.agents) {
        usageData.agents.forEach((u) => (usageMap[u.agent_id] = u));
      }

      set({
        agents: agentsData.agents || [],
        usage: usageMap,
        providers: providersData.providers || [],
        error: null,
      });
    } catch (err: any) {
      set({ error: err.message });
    } finally {
      set({ isLoading: false });
    }
  },

  testConnection: async (agentId: string) => {
    return api('/api/agents', { json: { action: 'test_connection', id: agentId } });
  },

  refreshUsage: async () => {
    const { agents } = get();
    const ids = agents.map((a) => a.id).filter(Boolean);
    if (!ids.length) return;
    try {
      await api('/agent-usage/auto-refresh', { json: { agent_ids: ids } });
      const usageData = await api<{ agents: Usage[] }>('/agent-usage/current');
      const usageMap: Record<string, Usage> = {};
      usageData.agents.forEach((u) => (usageMap[u.agent_id] = u));
      set({ usage: usageMap });
    } catch (err) {
      console.error('Usage refresh failed', err);
    }
  },
}));
