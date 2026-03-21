import { useEffect, useState } from 'react';
import { Github, Mail, Calendar, MessageCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { ServiceCard } from './ServiceCard';
import { ApiKeyForm } from './ApiKeyForm';
import { DisconnectDialog } from './DisconnectDialog';
import { useSSEHub } from '../../hooks/useSSEHub';

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

type ConnectMethod = 'oauth' | 'api_key';

interface ServiceDef {
  provider: string;
  displayName: string;
  description: string;
  icon: React.ReactNode;
  connectMethod: ConnectMethod;
  oauthUrl?: string;
}

const SERVICE_DEFS: ServiceDef[] = [
  {
    provider: 'github',
    displayName: 'GitHub',
    description: 'Read repos, create branches, open PRs',
    icon: <Github className="w-6 h-6" />,
    connectMethod: 'oauth',
    oauthUrl: '/api/v1/oauth/github/start',
  },
  {
    provider: 'email',
    displayName: 'Email',
    description: 'Send notifications, receive and route emails',
    icon: <Mail className="w-6 h-6" />,
    connectMethod: 'oauth',
    oauthUrl: '/api/v1/oauth/google/start',
  },
  {
    provider: 'google_calendar',
    displayName: 'Google Calendar',
    description: 'Sync deadlines, push milestones',
    icon: <Calendar className="w-6 h-6" />,
    connectMethod: 'oauth',
    oauthUrl: '/api/v1/oauth/google/start',
  },
  {
    provider: 'whatsapp',
    displayName: 'WhatsApp',
    description: 'Send and receive messages via agents',
    icon: <MessageCircle className="w-6 h-6" />,
    connectMethod: 'api_key',
  },
];

interface DisconnectState {
  connectionId: string;
  serviceName: string;
}

interface ConnectionStatusSSEPayload {
  provider?: string;
  status?: string;
}

export function ConnectionsPage() {
  const [connections, setConnections] = useState<WorkspaceConnection[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [disconnectState, setDisconnectState] = useState<DisconnectState | null>(null);
  const [whatsAppPublicUrlSet, setWhatsAppPublicUrlSet] = useState<boolean | null>(null);
  // Post-OAuth feedback state
  const [oauthSuccess, setOauthSuccess] = useState<string | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);

  // SSE subscription for real-time connection status updates
  useSSEHub('connection:status', (payload) => {
    const data = payload as ConnectionStatusSSEPayload;
    if (!data?.provider || !data?.status) return;
    setConnections((prev) =>
      prev.map((c) =>
        c.provider === data.provider
          ? { ...c, status: data.status as ConnectionStatus }
          : c,
      ),
    );
  }, []);

  useEffect(() => {
    // Process post-OAuth redirect query params
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('connected');
    const errorMsg = params.get('error');

    if (connected) {
      setOauthSuccess(connected === 'github' ? 'GitHub connected' : 'Google connected');
      params.delete('connected');
    }
    if (errorMsg) {
      setOauthError(decodeURIComponent(errorMsg));
      params.delete('error');
    }

    // Clean up query params without navigation
    const newSearch = params.toString();
    const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '');
    window.history.replaceState(null, '', newUrl);

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

    // Check if PORTER_PUBLIC_URL is set (needed for WhatsApp webhooks)
    // We use the health endpoint which exposes publicUrl
    async function checkPublicUrl() {
      try {
        const res = await api<{ publicUrl?: string; porter_public_url?: string }>(
          '/api/admin/health',
        );
        const publicUrl =
          (res as unknown as Record<string, unknown>).publicUrl as string | undefined ??
          (res as unknown as Record<string, unknown>).porter_public_url as string | undefined;
        setWhatsAppPublicUrlSet(
          typeof publicUrl === 'string' && publicUrl.length > 0 && !publicUrl.includes('localhost'),
        );
      } catch {
        setWhatsAppPublicUrlSet(false);
      }
    }

    load();
    checkPublicUrl();
  }, []);

  function handleConnect(provider: string) {
    const svc = SERVICE_DEFS.find((s) => s.provider === provider);
    if (!svc) return;

    if (svc.connectMethod === 'oauth' && svc.oauthUrl) {
      // OAuth flow: redirect to authorization endpoint
      window.location.href = svc.oauthUrl;
    } else {
      // API key flow: show inline form
      setSelectedProvider(provider);
    }
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

      {/* Post-OAuth success/error feedback */}
      {oauthSuccess && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-[var(--success,#16a34a)]/10 border border-[var(--success,#16a34a)]/30 text-sm text-[var(--success,#16a34a)]">
          <span className="font-medium">{oauthSuccess}</span>
          <button
            onClick={() => setOauthSuccess(null)}
            className="ml-auto text-[var(--success,#16a34a)] hover:opacity-70"
            aria-label="Dismiss"
          >
            &times;
          </button>
        </div>
      )}

      {oauthError && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-[var(--danger,#dc2626)]/10 border border-[var(--danger,#dc2626)]/30 text-sm text-[var(--danger,#dc2626)]">
          <span>OAuth error: {oauthError}</span>
          <button
            onClick={() => setOauthError(null)}
            className="ml-auto text-[var(--danger,#dc2626)] hover:opacity-70"
            aria-label="Dismiss"
          >
            &times;
          </button>
        </div>
      )}

      {/* Service grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {SERVICE_DEFS.map((svc, index) => {
          const conn = connections.find((c) => c.provider === svc.provider);
          const status: ConnectionStatus = conn?.status ?? 'disconnected';

          // WhatsApp prerequisite check: needs a public HTTPS URL for webhooks
          const showWhatsAppWarning =
            svc.provider === 'whatsapp' &&
            whatsAppPublicUrlSet === false &&
            status === 'disconnected';

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

              {/* WhatsApp prerequisite callout */}
              {showWhatsAppWarning && (
                <div className="mt-2 px-3 py-2 rounded-md text-xs text-[var(--warning,#d97706)] bg-[var(--warning,#d97706)]/10 border border-[var(--warning,#d97706)]/30">
                  WhatsApp requires a public HTTPS URL. Set PORTER_PUBLIC_URL first.
                </div>
              )}

              {/* API key form shown below card — only for api_key providers */}
              {selectedProvider === svc.provider && svc.connectMethod === 'api_key' && (
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
