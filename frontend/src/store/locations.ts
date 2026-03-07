import { create } from 'zustand';
import { api } from '../lib/api';

export interface Node {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'degraded';
  ip?: string;
  version?: string;
  last_seen?: number;
}

export interface Location {
  id: string;
  name: string;
  path: string;
  node_id: string;
  type: 'local' | 'remote' | 'cloud';
}

interface LocationState {
  nodes: Node[];
  locations: Location[];
  isLoading: boolean;
  error: string | null;

  fetchData: () => Promise<void>;
  addLocation: (loc: Partial<Location>) => Promise<void>;
  removeLocation: (id: string) => Promise<void>;
}

export const useLocationStore = create<LocationState>((set, get) => ({
  nodes: [],
  locations: [],
  isLoading: false,
  error: null,

  fetchData: async () => {
    set({ isLoading: true });
    try {
      const [nodesData, locsData] = await Promise.all([
        api<{ nodes: Node[] }>('/api/nodes'),
        api<{ locations: Location[] }>('/api/locations'),
      ]);
      set({ 
        nodes: nodesData.nodes || [], 
        locations: locsData.locations || [], 
        error: null 
      });
    } catch (err: any) {
      set({ error: err.message });
    } finally {
      set({ isLoading: false });
    }
  },

  addLocation: async (loc: Partial<Location>) => {
    try {
      await api('/api/locations', { json: { action: 'add', ...loc } });
      get().fetchData();
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  removeLocation: async (id: string) => {
    try {
      await api('/api/locations', { json: { action: 'remove', id } });
      get().fetchData();
    } catch (err: any) {
      set({ error: err.message });
    }
  },
}));
