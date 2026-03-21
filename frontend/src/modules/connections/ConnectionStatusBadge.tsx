type ConnectionStatus = 'connected' | 'needs_reauth' | 'disconnected' | 'error';

const STATUS_CONFIG: Record<ConnectionStatus, { dotClass: string; label: string }> = {
  connected: {
    dotClass: 'bg-[var(--success)]',
    label: 'Connected',
  },
  needs_reauth: {
    dotClass: 'bg-[var(--warning)]',
    label: 'Reconnect needed',
  },
  disconnected: {
    dotClass: 'bg-[var(--text3)]',
    label: 'Not connected',
  },
  error: {
    dotClass: 'bg-[var(--danger)]',
    label: 'Error',
  },
};

interface ConnectionStatusBadgeProps {
  status: ConnectionStatus;
}

export function ConnectionStatusBadge({ status }: ConnectionStatusBadgeProps) {
  const { dotClass, label } = STATUS_CONFIG[status];

  return (
    <div className="flex items-center gap-1.5">
      <div
        className={`w-2 h-2 rounded-full flex-shrink-0 ${dotClass}`}
        aria-label={label}
        style={{ transition: 'background-color 150ms var(--ease-default, ease)' }}
      />
      <span className="text-xs text-[var(--text3)]">{label}</span>
    </div>
  );
}
