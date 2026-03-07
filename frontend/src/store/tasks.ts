import { create } from 'zustand';
import { api } from '../lib/api';

export interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  priority: 'low' | 'normal' | 'high' | 'critical';
  phase: string;
  created_at: number;
  updated_at?: number;
  completed_at?: number;
  assigned_agent_id?: string;
  result?: string;
  tags?: string[]; // Parsed from JSON string in DB
  sort_order: number;
}

interface TaskState {
  tasks: Task[];
  isLoading: boolean;
  error: string | null;

  fetchTasks: () => Promise<void>;
  createTask: (task: Partial<Task>) => Promise<void>;
  updateTaskStatus: (taskId: string, status: string, result?: string) => Promise<void>;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  isLoading: false,
  error: null,

  fetchTasks: async () => {
    set({ isLoading: true });
    try {
      const data = await api<{ ok: boolean; tasks: any[] }>('/api/task-registry', { method: 'GET' });
      if (data.ok) {
        // Parse tags if they are strings
        const tasks = data.tasks.map(t => ({
          ...t,
          tags: typeof t.tags === 'string' ? JSON.parse(t.tags || '[]') : t.tags
        }));
        set({ tasks, error: null });
      }
    } catch (err: any) {
      set({ error: err.message });
    } finally {
      set({ isLoading: false });
    }
  },

  createTask: async (task: Partial<Task>) => {
    try {
      await api('/api/task-registry', { json: { action: 'create', ...task } });
      get().fetchTasks();
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  updateTaskStatus: async (taskId: string, status: string, result?: string) => {
    try {
      await api('/api/task-registry', { 
        json: { action: 'update_status', id: taskId, status, result } 
      });
      get().fetchTasks();
    } catch (err: any) {
      set({ error: err.message });
    }
  },
}));
