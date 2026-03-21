import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ActivityEvent, CategorizedActivity, QueuedJob } from '../../hooks/useProjectActivity';

function relativeTime(unixSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000 - unixSeconds);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 172800) return 'Yesterday';
  return new Date(unixSeconds * 1000).toLocaleDateString();
}

function dotColor(eventType: string): string {
  switch (eventType) {
    case 'job_started':
    case 'wizard_start':
      return 'bg-[var(--accent)]';
    case 'job_complete':
      return 'bg-[var(--success,#22c55e)]';
    case 'job_failed':
      return 'bg-[var(--danger)]';
    default:
      return 'bg-[var(--text3)]';
  }
}

// Expandable event row component
function EventRow({ event }: { event: ActivityEvent }) {
  const [expanded, setExpanded] = useState(false);
  const detailStr = typeof event.detail === 'string' ? event.detail : JSON.stringify(event.detail);
  const hasDetail = event.detail != null && detailStr !== '{}' && detailStr !== 'null' && detailStr !== '';

  return (
    <div
      className={`flex gap-3 p-3 rounded-lg hover:bg-[var(--surface)] transition-colors ${hasDetail ? 'cursor-pointer' : ''}`}
      onClick={() => hasDetail && setExpanded(!expanded)}
    >
      <div className="flex-shrink-0 mt-1.5">
        <div className={`w-2 h-2 rounded-full ${dotColor(event.event_type)}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-[var(--text)] truncate">{event.agent_name}</span>
          <span className="text-xs text-[var(--text3)] flex-shrink-0">{relativeTime(event.created_at)}</span>
          {hasDetail && (
            <span className="text-xs text-[var(--text3)]">{expanded ? '▲' : '▼'}</span>
          )}
        </div>
        <p className="text-sm text-[var(--text2)] leading-snug mt-0.5">{event.summary}</p>
        <AnimatePresence>
          {expanded && hasDetail && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <pre className="text-xs text-[var(--text3)] mt-2 p-2 rounded bg-[var(--bg)] whitespace-pre-wrap break-words">
                {typeof event.detail === 'string' ? event.detail : JSON.stringify(event.detail, null, 2)}
              </pre>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function SectionHeader({ title, count, dotClass }: { title: string; count: number; dotClass: string }) {
  return (
    <div className="flex items-center gap-2 py-2">
      <div className={`w-2 h-2 rounded-full ${dotClass}`} />
      <span className="text-xs font-semibold text-[var(--text3)] uppercase tracking-wider">{title}</span>
      {count > 0 && (
        <span className="text-xs text-[var(--text3)] bg-[var(--surface)] px-1.5 py-0.5 rounded-full">{count}</span>
      )}
    </div>
  );
}

function QueuedRow({ job }: { job: QueuedJob }) {
  return (
    <div className="flex gap-3 p-3 rounded-lg hover:bg-[var(--surface)] transition-colors">
      <div className="flex-shrink-0 mt-1.5">
        <div className="w-2 h-2 rounded-full bg-[var(--text3)]" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-[var(--text)] truncate">{job.agent_name || 'Agent'}</span>
          <span className="text-xs text-[var(--text3)] flex-shrink-0">{job.trigger_type}</span>
        </div>
        <p className="text-sm text-[var(--text2)] leading-snug mt-0.5">
          {job.prompt ? job.prompt.slice(0, 100) + (job.prompt.length > 100 ? '...' : '') : 'Pending task'}
        </p>
      </div>
    </div>
  );
}

interface ActivityFeedProps {
  categorized: CategorizedActivity;
  isLoading: boolean;
}

export function ActivityFeed({ categorized, isLoading }: ActivityFeedProps) {
  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="animate-pulse bg-[var(--surface)] rounded h-12" />
        ))}
      </div>
    );
  }

  const { active, completed, queued } = categorized;
  const isEmpty = active.length === 0 && completed.length === 0 && queued.length === 0;

  if (isEmpty) {
    return (
      <p className="text-sm text-[var(--text3)] italic text-center py-8">
        No activity yet -- agents will report here once they start working
      </p>
    );
  }

  return (
    <div className="space-y-1 p-4">
      {/* Active section -- what's happening NOW */}
      {active.length > 0 && (
        <div>
          <SectionHeader title="Active" count={active.length} dotClass="bg-[var(--accent)] animate-pulse" />
          {active.map((event) => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <EventRow event={event} />
            </motion.div>
          ))}
        </div>
      )}

      {/* Completed section -- what happened today */}
      {completed.length > 0 && (
        <div>
          <SectionHeader title="Completed" count={completed.length} dotClass="bg-[var(--success,#22c55e)]" />
          {completed.map((event) => (
            <EventRow key={event.id} event={event} />
          ))}
        </div>
      )}

      {/* Queued section -- what's coming next */}
      {queued.length > 0 && (
        <div>
          <SectionHeader title="Queued" count={queued.length} dotClass="bg-[var(--text3)]" />
          {queued.map((job) => (
            <QueuedRow key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  );
}
