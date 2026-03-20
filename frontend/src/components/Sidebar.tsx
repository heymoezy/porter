import { useEffect } from 'react';
import {
  MessageSquare,
  Network,
  Brain,
  Puzzle,
  FolderKanban,
  Workflow,
  MapPin,
  Files,
  Monitor,
  Moon,
  Sun,
} from 'lucide-react';
import { useAppStore, type TabId } from '../store/app';

const APP_NAME = 'Porter';

const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'orchestration', label: 'Orchestration', icon: Network },
  { id: 'memory', label: 'Memory', icon: Brain },
  { id: 'extensions', label: 'Extensions', icon: Puzzle },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'workflows', label: 'Workflows', icon: Workflow },
  { id: 'locations', label: 'Locations', icon: MapPin },
  { id: 'files', label: 'Files', icon: Files },
];

const THEME_ICON = {
  system: Monitor,
  dark: Moon,
  light: Sun,
} as const;

const THEME_TOOLTIP = {
  system: 'System preference',
  dark: 'Dark mode',
  light: 'Light mode',
} as const;

export function Sidebar() {
  const { activeTab, setActiveTab, sidebarCollapsed, themePreference, cycleTheme } = useAppStore();

  // Apply saved theme on mount
  useEffect(() => {
    const saved = localStorage.getItem('porter_theme');
    if (saved === 'dark' || saved === 'light') {
      document.documentElement.setAttribute('data-theme', saved);
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }, []);

  const ThemeIcon = THEME_ICON[themePreference];

  return (
    <aside
      className={`flex flex-col bg-bg border-r border-border transition-all ${
        sidebarCollapsed ? 'w-14' : 'w-52'
      }`}
    >
      {/* Logo */}
      <div className="p-4 border-b border-border">
        <span className="text-sm font-bold tracking-widest text-text2">
          {sidebarCollapsed ? APP_NAME[0] : APP_NAME.toUpperCase()}
        </span>
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors ${
                isActive
                  ? 'bg-surface text-text border-r-2 border-accent'
                  : 'text-text3 hover:text-text2 hover:bg-surface/40'
              }`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {!sidebarCollapsed && <span>{tab.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border flex flex-col gap-2">
        {/* Theme toggle */}
        <div className={`flex ${sidebarCollapsed ? 'justify-center' : 'justify-start'}`}>
          <button
            onClick={cycleTheme}
            title={THEME_TOOLTIP[themePreference]}
            className="w-8 h-8 flex items-center justify-center text-text3 hover:text-text2 transition-colors rounded"
          >
            <ThemeIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Version */}
        <span className="text-[10px] text-text3 tracking-wider">
          {sidebarCollapsed ? 'v33' : `${APP_NAME} v0.33.28`}
        </span>
      </div>
    </aside>
  );
}
