import { useEffect, useState } from 'react';
import { Github, Mail, Calendar, MessageCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { ServiceCard } from './ServiceCard';
import { ApiKeyForm } from './ApiKeyForm';
import { DisconnectDialog } from './DisconnectDialog';

type ConnectionStatus = 'connected' | 'needs_reauth' | 'disconnected' | 'error';

interface WorkspaceConnection {
  id: string;
  provider: string;
  kind: string;
  status: ConnectionStatus;
  last_sync_at: number | null;
  scopes_json: string | null;
}

interface ConnectionsApiResponse {
  data: WorkspaceConnection[];
}

interface ProfileApiResponse {
  data: {
    username: string;
    displayName: string;
    role: string;
    email: string | null;
  };
}

interface ServiceDef {
  provider: string;
  displayName: string;
  description: string;
  icon: React.ReactNode;
}

const SERVICE_DEFS: ServiceDef[] = [
  {
    provider: 'github',
    displayName: 'GitHub',
    description: 'Read repos, create branches, open PRs',
    icon: <Github className="w-6 h-6" />,
  },
  {
    provider: 'email',
    displayName: 'Email',
    description: 'Send notifications, receive and route emails',
    icon: <Mail className="w-6 h-6" />,
  },
  {
    provider: 'google_calendar',
    displayName: 'Google Calendar',
    description: 'Sync deadlines, push milestones',
    icon: <Calendar className="w-6 h-6" />,
  },
  {
    provider: 'whatsapp',
    displayName: 'WhatsApp',
    description: 'Send and receive messages via agents',
    icon: <MessageCircle className="w-6 h-6" />,
  },
];

interface DisconnectState {
  connectionId: string;
  serviceName: string;
}

export function ConnectionsPage() {
  const [connections, setConnections] = useState<WorkspaceConnection[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [disconnectState, setDisconnectState] = useState<DisconnectState | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [connRes, profileRes] = await Promise.all([
          api<ConnectionsApiResponse>('/api/v1/connections'),
          api<ProfileApiResponse>('/api/v1/auth/me'),
        ]);
        setConnections(connRes.data ?? []);
        setIsAdmin(profileRes.data?.role === 'admin');
      } catch {
        // API may not be up yet — default to empty state, non-admin
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function handleConnect(provider: string) {
    setSelectedProvider(provider);
  }

  function handleDisconnect(connectionId: string, serviceName: string) {
    setDisconnectState({ connectionId, serviceName });
  }

  function handleManage(_connectionId: string) {
    // Manage panel — future scope. For now no-op.
  }

  async function handleApiKeySave(provider: string, key: string) {
    await api('/api/v1/connections', {
      method: 'POST',
      json: { provider, kind: 'api_key', credentials: { key } },
    });
    // Reload connections
    const res = await api<ConnectionsApiResponse>('/api/v1/connections');
    setConnections(res.data ?? []);
    setSelectedProvider(null);
  }

  async function handleDisconnectConfirm() {
    if (!disconnectState) return;
    await api(`/api/v1/connections/${disconnectState.connectionId}`, {
      method: 'DELETE',
    });
    setConnections((prev) => prev.filter((c) => c.id !== disconnectState.connectionId));
    setDisconnectState(null);
  }

  if (loading) {
    return (
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {SERVICE_DEFS.map((_, i) => (
          <div key={i} className="animate-pulse bg-[var(--surface)] rounded-lg h-40" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-semibold text-[var(--text)]">Connections</h1>
        <p className="mt-1 text-sm text-[var(--text2)]">
          Connect services to give agents real-world reach
        </p>
      </div>

      {/* Service grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {SERVICE_DEFS.map((svc, index) => {
          const conn = connections.find((c) => c.provider === svc.provider);
          const status: ConnectionStatus = conn?.status ?? 'disconnected';

          return (
            <div key={svc.provider}>
              <div
                style={{
                  opacity: 0,
                  transform: 'translateY(8px)',
                  animation: `fadeSlideIn 250ms ease-out ${index * 50}ms forwards`,
                }}
              >
                <ServiceCard
                  provider={svc.provider}
                  displayName={svc.displayName}
                  description={svc.description}
                  status={status}
                  lastSyncAt={conn?.last_sync_at ?? null}
                  connectionId={conn?.id ?? null}
                  isAdmin={isAdmin}
                  icon={svc.icon}
                  onConnect={() => handleConnect(svc.provider)}
                  onDisconnect={(id) => handleDisconnect(id, svc.displayName)}
                  onManage={handleManage}
                  animationDelay={index * 50}
                />
              </div>

              {/* API key form shown below connected card */}
              {selectedProvider === svc.provider && (
                <div className="mt-3">
                  <ApiKeyForm
                    provider={svc.displayName}
                    onSave={(key) => handleApiKeySave(svc.provider, key)}
                    onCancel={() => setSelectedProvider(null)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Disconnect dialog */}
      <DisconnectDialog
        open={disconnectState !== null}
        serviceName={disconnectState?.serviceName ?? ''}
        onConfirm={handleDisconnectConfirm}
        onCancel={() => setDisconnectState(null)}
      />

      {/* Entrance animation keyframe */}
      <style>{`
        @keyframes fadeSlideIn {
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
