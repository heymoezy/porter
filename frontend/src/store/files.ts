import { create } from 'zustand';
import { api } from '../lib/api';

export interface FileItem {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  mtime: number;
  type: string;
}

interface FileState {
  currentPath: string;
  files: FileItem[];
  isLoading: boolean;
  error: string | null;

  fetchFiles: (path?: string) => Promise<void>;
  downloadFile: (path: string) => Promise<void>;
  deleteFile: (path: string) => Promise<void>;
}

export const useFileStore = create<FileState>((set, get) => ({
  currentPath: '/',
  files: [],
  isLoading: false,
  error: null,

  fetchFiles: async (path = '/') => {
    set({ isLoading: true, currentPath: path });
    try {
      const data = await api<{ ok: boolean; files: FileItem[] }>(`/api/files?path=${encodeURIComponent(path)}`);
      if (data.ok) {
        set({ files: data.files, error: null });
      }
    } catch (err: any) {
      set({ error: err.message });
    } finally {
      set({ isLoading: false });
    }
  },

  downloadFile: async (path: string) => {
    window.open(`/api/files/download?path=${encodeURIComponent(path)}`, '_blank');
  },

  deleteFile: async (path: string) => {
    try {
      await api('/api/files', { json: { action: 'delete', path } });
      get().fetchFiles(get().currentPath);
    } catch (err: any) {
      set({ error: err.message });
    }
  },
}));
