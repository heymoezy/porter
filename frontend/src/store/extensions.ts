import { create } from 'zustand';
import { api } from '../lib/api';

export interface ExtensionTool {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'inactive' | 'error';
  capabilities: string[];
  version?: string;
}

interface ExtensionState {
  tools: ExtensionTool[];
  isLoading: boolean;
  error: string | null;

  fetchTools: () => Promise<void>;
  toggleTool: (id: string, active: boolean) => Promise<void>;
}

export const useExtensionStore = create<ExtensionState>((set, get) => ({
  tools: [],
  isLoading: false,
  error: null,

  fetchTools: async () => {
    set({ isLoading: true });
    try {
      const data = await api<{ ok: boolean; tools: ExtensionTool[] }>('/api/extensions');
      set({ tools: data.tools || [], error: null });
    } catch (err: any) {
      set({ error: err.message });
    } finally {
      set({ isLoading: false });
    }
  },

  toggleTool: async (id: string, active: boolean) => {
    try {
      await api('/api/extensions', { json: { action: 'toggle', id, active } });
      get().fetchTools();
    } catch (err) {
      console.error('Toggle failed', err);
    }
  },
}));
