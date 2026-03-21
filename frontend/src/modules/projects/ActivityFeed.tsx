import type { ActivityEvent } from '../../hooks/useProjectActivity';

function relativeTime(unixSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000 - unixSeconds);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 172800) return 'Yesterday';
  return new Date(unixSeconds * 1000).toLocaleDateString();
}

function getGroupLabel(unixSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000 - unixSeconds);
  if (diff < 300) return 'Just now';
  const eventDate = new Date(unixSeconds * 1000);
  const today = new Date();
  if (
    eventDate.getFullYear() === today.getFullYear() &&
    eventDate.getMonth() === today.getMonth() &&
    eventDate.getDate() === today.getDate()
  ) {
    return 'Earlier today';
  }
  return eventDate.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
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

interface ActivityFeedProps {
  events: ActivityEvent[];
  isLoading: boolean;
}

export function ActivityFeed({ events, isLoading }: ActivityFeedProps) {
  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="animate-pulse bg-[var(--surface)] rounded h-12"
          />
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <p className="text-sm text-[var(--text3)] italic text-center py-8">
        No activity yet — agents will report here once they start working
      </p>
    );
  }

  // Group events by time bucket
  const groups: { label: string; events: ActivityEvent[] }[] = [];
  const labelMap = new Map<string, ActivityEvent[]>();
  for (const event of events) {
    const label = getGroupLabel(event.created_at);
    if (!labelMap.has(label)) {
      labelMap.set(label, []);
      groups.push({ label, events: labelMap.get(label)! });
    }
    labelMap.get(label)!.push(event);
  }

  return (
    <div className="space-y-1 p-4">
      {groups.map((group) => (
        <div key={group.label}>
          <div className="text-xs font-semibold text-[var(--text3)] uppercase tracking-wider py-2">
            {group.label}
          </div>
          {group.events.map((event) => (
            <div
              key={event.id}
              className="flex gap-3 p-3 rounded-lg hover:bg-[var(--surface)] transition-colors group"
            >
              {/* Status dot */}
              <div className="flex-shrink-0 mt-1.5">
                <div className={`w-2 h-2 rounded-full ${dotColor(event.event_type)}`} />
              </div>
              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium text-[var(--text)] truncate">
                    {event.agent_name}
                  </span>
                  <span className="text-xs text-[var(--text3)] flex-shrink-0">
                    {relativeTime(event.created_at)}
                  </span>
                </div>
                <p className="text-sm text-[var(--text2)] leading-snug mt-0.5">
                  {event.summary}
                </p>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
