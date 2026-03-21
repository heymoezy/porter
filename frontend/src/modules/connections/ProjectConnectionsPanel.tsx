import { useEffect, useState } from 'react';
import { Github, Mail, Calendar, MessageCircle } from 'lucide-react';
import { api } from '../../lib/api';

interface WorkspaceConnection {
  id: string;
  provider: string;
  kind: string;
  status: string;
  display_name: string;
}

interface ProjectConnection extends WorkspaceConnection {
  access_mode: string;
  override_status: string | null;
}

interface ConnectionsResponse {
  data: {
    connections: WorkspaceConnection[];
    count: number;
  };
}

interface ProjectConnectionsResponse {
  data: {
    connections: ProjectConnection[];
    count: number;
  };
}

interface ProfileResponse {
  data: {
    role: string;
  };
}

interface ServiceDef {
  provider: string;
  displayName: string;
  icon: React.ReactNode;
}

const SERVICE_DEFS: ServiceDef[] = [
  {
    provider: 'github',
    displayName: 'GitHub',
    icon: <Github className="w-4 h-4" />,
  },
  {
    provider: 'email',
    displayName: 'Email',
    icon: <Mail className="w-4 h-4" />,
  },
  {
    provider: 'google_calendar',
    displayName: 'Google Calendar',
    icon: <Calendar className="w-4 h-4" />,
  },
  {
    provider: 'whatsapp',
    displayName: 'WhatsApp',
    icon: <MessageCircle className="w-4 h-4" />,
  },
];

interface ProjectConnectionsPanelProps {
  projectId: string;
}

export function ProjectConnectionsPanel({ projectId }: ProjectConnectionsPanelProps) {
  const [workspaceConnections, setWorkspaceConnections] = useState<WorkspaceConnection[]>([]);
  const [projectConnections, setProjectConnections] = useState<ProjectConnection[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [wsRes, projRes, profileRes] = await Promise.all([
          api<ConnectionsResponse>('/api/v1/connections'),
          api<ProjectConnectionsResponse>(`/api/v1/connections/project/${projectId}`),
          api<ProfileResponse>('/api/v1/auth/me'),
        ]);
        setWorkspaceConnections(wsRes.data?.connections ?? []);
        setProjectConnections(projRes.data?.connections ?? []);
        // Operators and admins can manage project-level overrides (only viewers cannot)
        const role = profileRes.data?.role;
        setCanEdit(role === 'admin' || role === 'operator');
      } catch {
        // API unavailable — remain in empty/disabled state
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [projectId]);

  async function handleOverrideChange(provider: string, connectionId: string) {
    if (connectionId === '') {
      // Revert to workspace default — find existing override for this provider and detach it
      const existing = projectConnections.find(
        (pc) => pc.provider === provider && pc.override_status !== null,
      );
      if (existing) {
        await api(`/api/v1/connections/project/${projectId}/${existing.id}`, {
          method: 'DELETE',
        });
      }
    } else {
      // Attach a specific connection as the project-level override
      await api(`/api/v1/connections/project/${projectId}`, {
        method: 'POST',
        json: { connection_id: connectionId, access_mode: 'read_write' },
      });
    }

    // Refresh project connections
    const res = await api<ProjectConnectionsResponse>(`/api/v1/connections/project/${projectId}`);
    setProjectConnections(res.data?.connections ?? []);
  }

  if (loading) {
    return (
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
        <div className="h-4 w-32 bg-[var(--raised)] rounded animate-pulse mb-3" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-11 bg-[var(--raised)] rounded animate-pulse mb-2" />
        ))}
      </div>
    );
  }

  // Only render services that have at least one workspace connection available
  const servicesWithConnections = SERVICE_DEFS.filter((svc) =>
    workspaceConnections.some((wc) => wc.provider === svc.provider),
  );

  if (servicesWithConnections.length === 0) {
    return (
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
        <h3 className="text-sm font-semibold text-[var(--text)] mb-2">Connection Overrides</h3>
        <p className="text-sm text-[var(--text3)]">Using workspace connections for all services</p>
      </div>
    );
  }

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
      <h3 className="text-sm font-semibold text-[var(--text)] mb-3">Connection Overrides</h3>
      <div className="space-y-0">
        {servicesWithConnections.map((svc, i) => {
          const wsOptions = workspaceConnections.filter((wc) => wc.provider === svc.provider);
          // Determine active override: find a project connection for this provider that has an explicit override
          const activeOverride = projectConnections.find(
            (pc) => pc.provider === svc.provider && pc.override_status !== null,
          );
          const selectedId = activeOverride?.id ?? '';

          return (
            <div
              key={svc.provider}
              className={`flex items-center gap-3 py-2.5 ${
                i < servicesWithConnections.length - 1
                  ? 'border-b border-[var(--border)]'
                  : ''
              }`}
              style={{ minHeight: '44px' }}
            >
              <span className="text-[var(--text3)] flex-shrink-0">{svc.icon}</span>
              <span className="text-sm text-[var(--text2)] w-28 flex-shrink-0">{svc.displayName}</span>
              <select
                disabled={!canEdit}
                value={selectedId}
                onChange={(e) => void handleOverrideChange(svc.provider, e.target.value)}
                className="flex-1 text-sm bg-[var(--raised)] border border-[var(--border)] rounded-md px-2 py-1 text-[var(--text)] focus:outline-none focus:border-[var(--accent)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">Use workspace default</option>
                {wsOptions.map((wc) => (
                  <option key={wc.id} value={wc.id}>
                    {wc.display_name || wc.provider}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
}
