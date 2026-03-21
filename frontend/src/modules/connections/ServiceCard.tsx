import { ConnectionStatusBadge } from './ConnectionStatusBadge';

type ConnectionStatus = 'connected' | 'needs_reauth' | 'disconnected' | 'error';

interface ServiceCardProps {
  provider: string;
  displayName: string;
  description: string;
  status: ConnectionStatus;
  lastSyncAt: number | null;
  connectionId: string | null;
  isAdmin: boolean;
  icon: React.ReactNode;
  onConnect: () => void;
  onDisconnect: (id: string) => void;
  onManage: (id: string) => void;
  animationDelay?: number;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return 'Just now';
}

export function ServiceCard({
  displayName,
  description,
  status,
  lastSyncAt,
  connectionId,
  isAdmin,
  icon,
  onConnect,
  onDisconnect,
  onManage,
  animationDelay = 0,
}: ServiceCardProps) {
  function handleAction() {
    if (status === 'disconnected' || status === 'error') {
      onConnect();
    } else if (status === 'needs_reauth') {
      onConnect();
    } else if (connectionId) {
      onManage(connectionId);
    }
  }

  function handleDisconnect(e: React.MouseEvent) {
    e.stopPropagation();
    if (connectionId) {
      onDisconnect(connectionId);
    }
  }

  const actionLabel =
    status === 'disconnected' || status === 'error'
      ? `Connect ${displayName}`
      : status === 'needs_reauth'
      ? 'Reconnect'
      : 'Manage Connection';

  const actionClass =
    status === 'disconnected' || status === 'error'
      ? 'bg-[var(--accent)] text-white hover:bg-[var(--accent-h)] disabled:opacity-40'
      : status === 'needs_reauth'
      ? 'border border-[var(--warning)] text-[var(--warning)] bg-transparent hover:bg-[var(--warning)]/10 disabled:opacity-40'
      : 'border border-[var(--border)] text-[var(--text2)] bg-transparent hover:bg-[var(--surface)] disabled:opacity-40';

  const disabledTitle = !isAdmin ? 'Only admins can manage connections' : undefined;

  return (
    <div
      className="flex flex-col rounded-lg bg-[var(--surface)] border border-[var(--border)] p-4 gap-4"
      style={{
        animationDelay: `${animationDelay}ms`,
        transition: 'box-shadow 150ms ease, transform 150ms ease',
        minHeight: '128px',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
        (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.transform = '';
        (e.currentTarget as HTMLElement).style.boxShadow = '';
      }}
    >
      {/* Card header */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 flex items-center justify-center text-[var(--text2)] flex-shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold text-[var(--text)] leading-tight">{displayName}</p>
        </div>
        <ConnectionStatusBadge status={status} />
      </div>

      {/* Card body */}
      <div className="flex flex-col gap-1 flex-1">
        <p className="text-sm text-[var(--text2)]">{description}</p>
        <p className="text-xs text-[var(--text3)]">
          {lastSyncAt != null ? `Last synced ${formatRelativeTime(lastSyncAt)}` : 'Never synced'}
        </p>
      </div>

      {/* Card footer */}
      <div className="flex gap-2">
        <button
          onClick={handleAction}
          disabled={!isAdmin}
          title={disabledTitle}
          className={`flex-1 min-h-[44px] rounded-md px-3 text-sm font-medium transition-colors cursor-pointer disabled:cursor-not-allowed ${actionClass}`}
        >
          {actionLabel}
        </button>
        {status === 'connected' && connectionId && (
          <button
            onClick={handleDisconnect}
            disabled={!isAdmin}
            title={disabledTitle ?? 'Disconnect'}
            className="min-h-[44px] px-3 rounded-md border border-[var(--border)] text-[var(--danger)] text-sm hover:bg-[var(--danger)]/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Disconnect
          </button>
        )}
      </div>
    </div>
  );
}
