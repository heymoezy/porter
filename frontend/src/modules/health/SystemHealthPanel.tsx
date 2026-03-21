import { useSystemHealth, type BackendStatus, type TokenUsage } from '../../hooks/useSystemHealth';
import { DecisionLog } from './DecisionLog';

function statusColor(status: 'up' | 'down' | 'unknown'): string {
  switch (status) {
    case 'up': return 'bg-[var(--success,#22c55e)]';
    case 'down': return 'bg-[var(--danger)]';
    default: return 'bg-[var(--text3)]';
  }
}

function statusLabel(status: 'up' | 'down' | 'unknown'): string {
  switch (status) {
    case 'up': return 'Operational';
    case 'down': return 'Offline';
    default: return 'Unknown';
  }
}

function ServiceCard({ backend }: { backend: BackendStatus }) {
  return (
    <div className="flex items-center gap-4 p-4 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
      <div className={`w-3 h-3 rounded-full flex-shrink-0 ${statusColor(backend.status)}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[var(--text)]">{backend.name}</p>
        <p className="text-xs text-[var(--text3)] truncate">{backend.model}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-xs font-medium text-[var(--text2)]">{statusLabel(backend.status)}</p>
        {backend.latencyMs !== null && (
          <p className="text-xs text-[var(--text3)]">{backend.latencyMs}ms</p>
        )}
      </div>
    </div>
  );
}

function TokenUsageTable({ usage }: { usage: TokenUsage[] }) {
  if (usage.length === 0) {
    return (
      <p className="text-sm text-[var(--text3)] italic py-4">
        No token usage recorded yet
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)]">
            <th className="text-left py-2 text-xs font-semibold text-[var(--text3)] uppercase">Model</th>
            <th className="text-right py-2 text-xs font-semibold text-[var(--text3)] uppercase">Requests</th>
            <th className="text-right py-2 text-xs font-semibold text-[var(--text3)] uppercase">Input Tokens</th>
            <th className="text-right py-2 text-xs font-semibold text-[var(--text3)] uppercase">Output Tokens</th>
          </tr>
        </thead>
        <tbody>
          {usage.map((row) => (
            <tr key={row.model} className="border-b border-[var(--border)] last:border-0">
              <td className="py-2 text-[var(--text)]">{row.model}</td>
              <td className="py-2 text-right text-[var(--text2)]">{row.total_requests.toLocaleString()}</td>
              <td className="py-2 text-right text-[var(--text2)]">{row.total_input.toLocaleString()}</td>
              <td className="py-2 text-right text-[var(--text2)]">{row.total_output.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SystemHealthPanel() {
  const { health, isLoading } = useSystemHealth();

  if (isLoading || !health) {
    return (
      <div className="p-6 space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="animate-pulse bg-[var(--surface)] rounded-lg h-16" />
        ))}
      </div>
    );
  }

  const allUp = health.backends.every(b => b.status === 'up') && health.database.status === 'up';

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      {/* Overall status banner */}
      <div className="flex items-center gap-3">
        <div className={`w-3 h-3 rounded-full ${allUp ? 'bg-[var(--success,#22c55e)]' : 'bg-[var(--danger)]'}`} />
        <h2 className="text-lg font-semibold text-[var(--text)]">
          {allUp ? 'All Systems Operational' : 'Some Systems Degraded'}
        </h2>
        <span className="text-xs text-[var(--text3)] ml-auto">
          Last checked: {new Date(health.checkedAt).toLocaleTimeString()}
        </span>
      </div>

      {/* Service cards */}
      <section>
        <h3 className="text-xs font-semibold text-[var(--text3)] uppercase tracking-wider mb-3">Services</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {health.backends.map((backend) => (
            <ServiceCard key={backend.name} backend={backend} />
          ))}
          <ServiceCard
            backend={{
              name: 'Database',
              url: '',
              model: 'SQLite (WAL)',
              status: health.database.status,
              latencyMs: health.database.latencyMs,
            }}
          />
        </div>
      </section>

      {/* Token usage */}
      <section>
        <h3 className="text-xs font-semibold text-[var(--text3)] uppercase tracking-wider mb-3">
          Token Usage (Last 7 Days)
        </h3>
        <div className="bg-[var(--surface)] rounded-lg border border-[var(--border)] p-4">
          <TokenUsageTable usage={health.tokenUsage} />
        </div>
      </section>

      {/* Decision log */}
      <section>
        <h3 className="text-xs font-semibold text-[var(--text3)] uppercase tracking-wider mb-3">
          Decision Log
        </h3>
        <DecisionLog />
      </section>
    </div>
  );
}
