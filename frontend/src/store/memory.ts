import { create } from 'zustand';
import { api } from '../lib/api';

export interface MemorySession {
  id: string;
  name: string;
  size: number;
  last_updated: number;
}

export interface MemoryFact {
  id: string;
  text: string;
  category: string;
  ts: number;
}

interface MemoryState {
  sessions: MemorySession[];
  activeFacts: MemoryFact[];
  isLoading: boolean;
  error: string | null;

  fetchSessions: () => Promise<void>;
  fetchFacts: (sessionId: string) => Promise<void>;
  flushMemory: (sessionId: string) => Promise<void>;
}

export const useMemoryStore = create<MemoryState>((set) => ({
  sessions: [],
  activeFacts: [],
  isLoading: false,
  error: null,

  fetchSessions: async () => {
    set({ isLoading: true });
    try {
      const data = await api<{ ok: boolean; sessions: MemorySession[] }>('/api/memory/sessions');
      set({ sessions: data.sessions || [], error: null });
    } catch (err: any) {
      set({ error: err.message });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchFacts: async (sessionId: string) => {
    try {
      const data = await api<{ ok: boolean; facts: MemoryFact[] }>(`/api/memory/facts?session_id=${sessionId}`);
      set({ activeFacts: data.facts || [] });
    } catch (err) {
      console.error('Fact fetch failed', err);
    }
  },

  flushMemory: async (sessionId: string) => {
    try {
      await api('/api/memory/flush', { json: { session_id: sessionId } });
      // Refresh
    } catch (err) {
      console.error('Flush failed', err);
    }
  },
}));
