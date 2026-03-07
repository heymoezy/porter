import { create } from 'zustand';
import { api } from '../lib/api';

export interface HealthStatus {
  status: string;
  version: string;
  uptime: number;
  cpu_percent: number;
  memory_used_mb: number;
  disk_free_gb: number;
  services: Array<{
    name: string;
    status: 'up' | 'down' | 'unknown';
    version?: string;
    error?: string;
  }>;
}

export interface LogEntry {
  ts: number;
  level: string;
  msg: string;
  logger: string;
}

interface AdminState {
  health: HealthStatus | null;
  logs: LogEntry[];
  isLoading: boolean;
  error: string | null;

  fetchHealth: () => Promise<void>;
  fetchLogs: () => Promise<void>;
}

export const useAdminStore = create<AdminState>((set) => ({
  health: null,
  logs: [],
  isLoading: false,
  error: null,

  fetchHealth: async () => {
    set({ isLoading: true });
    try {
      const data = await api<HealthStatus>('/api/admin/health', { method: 'GET' });
      set({ health: data, error: null });
    } catch (err: any) {
      set({ error: err.message });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchLogs: async () => {
    try {
      const data = await api<{ entries: LogEntry[] }>('/api/admin/logs?limit=100');
      set({ logs: data.entries || [] });
    } catch (err) {
      console.error('Log fetch failed', err);
    }
  },
}));
