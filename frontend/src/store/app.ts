import { create } from 'zustand';

export type TabId =
  | 'chat'
  | 'orchestration'
  | 'memory'
  | 'extensions'
  | 'projects'
  | 'workflows'
  | 'locations'
  | 'files'
  | 'admin';

interface AppState {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeTab: 'chat',
  setActiveTab: (tab) => set({ activeTab: tab }),
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
}));
