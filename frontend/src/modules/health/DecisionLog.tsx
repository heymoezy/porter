import { useState } from 'react';
import { useDecisionLog, type DecisionEntry } from '../../hooks/useDecisionLog';

function relativeTime(unixSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000 - unixSeconds);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 172800) return 'Yesterday';
  return new Date(unixSeconds * 1000).toLocaleDateString();
}

function decisionIcon(type: string): string {
  switch (type) {
    case 'model_selection': return 'M';
    case 'agent_routing': return 'A';
    case 'task_skip': return 'S';
    default: return '?';
  }
}

function decisionLabel(type: string): string {
  switch (type) {
    case 'model_selection': return 'Model';
    case 'agent_routing': return 'Agent';
    case 'task_skip': return 'Skipped';
    default: return type;
  }
}

function DecisionRow({ decision }: { decision: DecisionEntry }) {
  return (
    <div className="flex gap-3 p-3 rounded-lg hover:bg-[var(--surface)] transition-colors">
      <div className="flex-shrink-0 w-7 h-7 rounded bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center">
        <span className="text-xs font-bold text-[var(--accent)]">{decisionIcon(decision.decision_type)}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-medium text-[var(--accent)]">{decisionLabel(decision.decision_type)}</span>
          <span className="text-sm font-medium text-[var(--text)] truncate">{decision.chosen}</span>
          <span className="text-xs text-[var(--text3)] flex-shrink-0 ml-auto">{relativeTime(decision.created_at)}</span>
        </div>
        <p className="text-sm text-[var(--text2)] leading-snug mt-0.5">{decision.reasoning}</p>
        {decision.alternatives.length > 0 && (
          <p className="text-xs text-[var(--text3)] mt-1">
            Also considered: {decision.alternatives.join(', ')}
          </p>
        )}
      </div>
    </div>
  );
}

export function DecisionLog() {
  const [typeFilter, setTypeFilter] = useState('');
  const { decisions, total, isLoading, offset, limit, setOffset, hasMore } = useDecisionLog({
    type: typeFilter || undefined,
  });

  const filterButtons = [
    { label: 'All', value: '' },
    { label: 'Model', value: 'model_selection' },
    { label: 'Agent', value: 'agent_routing' },
    { label: 'Skipped', value: 'task_skip' },
  ];

  return (
    <div className="bg-[var(--surface)] rounded-lg border border-[var(--border)]">
      <div className="flex items-center gap-2 p-3 border-b border-[var(--border)]">
        {filterButtons.map((btn) => (
          <button
            key={btn.value}
            onClick={() => { setTypeFilter(btn.value); setOffset(0); }}
            className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
              typeFilter === btn.value
                ? 'bg-[var(--accent)] text-white'
                : 'bg-[var(--bg)] text-[var(--text3)] hover:text-[var(--text2)]'
            }`}
          >
            {btn.label}
          </button>
        ))}
        <span className="text-xs text-[var(--text3)] ml-auto">{total} total</span>
      </div>
      <div className="divide-y divide-[var(--border)]">
        {isLoading && (
          <div className="p-4 space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="animate-pulse bg-[var(--bg)] rounded h-12" />
            ))}
          </div>
        )}
        {!isLoading && decisions.length === 0 && (
          <p className="text-sm text-[var(--text3)] italic text-center py-8">
            No decisions logged yet
          </p>
        )}
        {!isLoading && decisions.map((d) => (
          <DecisionRow key={d.id} decision={d} />
        ))}
      </div>
      {(offset > 0 || hasMore) && (
        <div className="flex items-center justify-between p-3 border-t border-[var(--border)]">
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
            className="text-xs text-[var(--accent)] disabled:text-[var(--text3)] disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-xs text-[var(--text3)]">
            {offset + 1}-{Math.min(offset + limit, total)} of {total}
          </span>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={!hasMore}
            className="text-xs text-[var(--accent)] disabled:text-[var(--text3)] disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
