import {
  MessageSquare,
  Network,
  Brain,
  Puzzle,
  FolderKanban,
  Workflow,
  MapPin,
  Files,
  Settings,
} from 'lucide-react';
import { useAppStore, type TabId } from '../store/app';

const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'orchestration', label: 'Orchestration', icon: Network },
  { id: 'memory', label: 'Memory', icon: Brain },
  { id: 'extensions', label: 'Extensions', icon: Puzzle },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'workflows', label: 'Workflows', icon: Workflow },
  { id: 'locations', label: 'Locations', icon: MapPin },
  { id: 'files', label: 'Files', icon: Files },
  { id: 'admin', label: 'Admin', icon: Settings },
];

export function Sidebar() {
  const { activeTab, setActiveTab, sidebarCollapsed } = useAppStore();

  return (
    <aside
      className={`flex flex-col bg-neutral-950 border-r border-neutral-800 transition-all ${
        sidebarCollapsed ? 'w-14' : 'w-52'
      }`}
    >
      {/* Logo */}
      <div className="p-4 border-b border-neutral-800">
        <span className="text-sm font-bold tracking-widest text-neutral-300">
          {sidebarCollapsed ? 'P' : 'PORTER'}
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
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                isActive
                  ? 'bg-neutral-800/60 text-white border-r-2 border-orange-500'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
              }`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {!sidebarCollapsed && <span>{tab.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-neutral-800">
        <span className="text-[10px] text-neutral-500 tracking-wider">
          {sidebarCollapsed ? 'v25' : 'PORTER v0.25.4'}
        </span>
      </div>
    </aside>
  );
}
