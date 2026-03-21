import { Sidebar } from './Sidebar';
import { useAppStore } from '../store/app';
import { ChatView } from '../modules/chat/ChatView';
import { ProjectDashboard } from '../modules/projects/ProjectDashboard';

function ProjectListPlaceholder() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-[var(--text2)] mb-2">Projects</h2>
        <p className="text-sm text-[var(--text3)]">Select a project or create one via chat</p>
      </div>
    </div>
  );
}

// Lazy placeholder for each tab — will be replaced with real modules
function TabPlaceholder({ name }: { name: string }) {
  if (name === 'chat') return <ChatView />;
  if (name === 'projects') {
    const projectId = useAppStore.getState().activeProjectId;
    if (projectId) {
      return <ProjectDashboard projectId={projectId} />;
    }
    return <ProjectListPlaceholder />;
  }

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-[var(--text2)] mb-2 capitalize">{name}</h2>
        <p className="text-sm text-[var(--text3)]">Module loading...</p>
      </div>
    </div>
  );
}

export function Layout() {
  const activeTab = useAppStore((s) => s.activeTab);

  return (
    <div className="flex h-screen bg-[var(--bg)] text-[var(--text)]">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Module header */}
        <div className="h-12 border-b border-[var(--border)] flex items-center px-6">
          <h1 className="text-sm font-semibold capitalize">{activeTab}</h1>
        </div>
        {/* Module content */}
        <div className="flex-1 overflow-y-auto">
          <TabPlaceholder name={activeTab} />
        </div>
      </main>
    </div>
  );
}
