import { create } from 'zustand';
import { api } from '../lib/api';

export interface User {
  username: string;
  displayName: string;
  fullName: string;
  email: string;
  role: string;
  createdAt: number;
}

interface UserState {
  currentUser: User | null;
  allUsers: User[];
  isLoading: boolean;
  error: string | null;

  fetchMe: () => Promise<void>;
  fetchAllUsers: () => Promise<void>;
  updateRole: (username: string, role: string) => Promise<void>;
  deleteUser: (username: string) => Promise<void>;
}

export const useUserStore = create<UserState>((set, get) => ({
  currentUser: null,
  allUsers: [],
  isLoading: false,
  error: null,

  fetchMe: async () => {
    try {
      const data = await api<User & { ok: boolean }>('/api/me');
      set({ currentUser: data, error: null });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  fetchAllUsers: async () => {
    set({ isLoading: true });
    try {
      const data = await api<{ ok: boolean; users: User[] }>('/api/admin/users', {
        json: { action: 'list' }
      });
      if (data.ok) {
        set({ allUsers: data.users, error: null });
      }
    } catch (err: any) {
      set({ error: err.message });
    } finally {
      set({ isLoading: false });
    }
  },

  updateRole: async (username: string, role: string) => {
    try {
      await api('/api/admin/users', { json: { action: 'update_role', username, role } });
      get().fetchAllUsers();
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  deleteUser: async (username: string) => {
    try {
      await api('/api/admin/users', { json: { action: 'delete', username } });
      set((s) => ({ allUsers: s.allUsers.filter((u) => u.username !== username) }));
    } catch (err: any) {
      set({ error: err.message });
    }
  },
}));
