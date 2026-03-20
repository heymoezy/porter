import { create } from 'zustand';

export type TabId =
  | 'chat'
  | 'orchestration'
  | 'memory'
  | 'extensions'
  | 'projects'
  | 'workflows'
  | 'locations'
  | 'files';

type ThemePreference = 'system' | 'dark' | 'light';

function applyTheme(theme: ThemePreference) {
  if (theme === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
  localStorage.setItem('porter_theme', theme);
}

interface AppState {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  themePreference: ThemePreference;
  cycleTheme: () => void;
}

const CYCLE: Record<ThemePreference, ThemePreference> = {
  system: 'dark',
  dark: 'light',
  light: 'system',
};

const savedTheme = (localStorage.getItem('porter_theme') as ThemePreference) || 'system';

export const useAppStore = create<AppState>((set, get) => ({
  activeTab: 'chat',
  setActiveTab: (tab) => set({ activeTab: tab }),
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  themePreference: savedTheme,
  cycleTheme: () => {
    const next = CYCLE[get().themePreference];
    applyTheme(next);
    set({ themePreference: next });
  },
}));
