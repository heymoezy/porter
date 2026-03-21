import { useEffect, useState } from 'react';
import { Calendar } from 'lucide-react';
import { api } from '../../lib/api';

interface CalendarEvent {
  id: string;
  title: string;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
}

interface CalendarEventsResponse {
  data: CalendarEvent[];
}

function formatEventDate(startAt: string, allDay: boolean): string {
  const date = new Date(startAt);
  const month = date.toLocaleString('en-US', { month: 'short' });
  const day = date.getDate();

  if (allDay) {
    return `${month} ${day}`;
  }

  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${month} ${day}, ${displayHours}:${minutes} ${ampm}`;
}

function getDateBadgeStyle(startAt: string): React.CSSProperties {
  const now = Date.now();
  const eventTime = new Date(startAt).getTime();
  const diff = eventTime - now;

  if (diff <= 0 && diff > -86400000) {
    // Within the current day (today or just passed today)
    return { backgroundColor: 'var(--danger)', color: '#fff' };
  }
  if (diff > 0 && diff <= 86400000) {
    // Within next 24 hours
    return { backgroundColor: 'var(--warning)', color: '#fff' };
  }
  return { backgroundColor: 'var(--raised)', color: 'var(--text2)' };
}

interface CalendarEventsDisplayProps {
  projectId: string;
}

export function CalendarEventsDisplay({ projectId }: CalendarEventsDisplayProps) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    api<CalendarEventsResponse>(`/api/v1/connections/project/${projectId}/calendar-events`)
      .then((res) => {
        setEvents(res.data ?? []);
      })
      .catch(() => {
        // Calendar not connected or API unavailable — render nothing
      });
  }, [projectId]);

  // Render nothing if no events (calendar not connected)
  if (events.length === 0) return null;

  const MAX_VISIBLE = 5;
  const visibleEvents = showAll ? events : events.slice(0, MAX_VISIBLE);
  const hasMore = events.length > MAX_VISIBLE;

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Calendar className="w-4 h-4 text-[var(--text3)]" />
        <h3 className="text-sm font-semibold text-[var(--text2)]">Upcoming Deadlines</h3>
      </div>

      <div className="relative">
        {/* Vertical timeline line */}
        <div
          className="absolute left-[5px] top-2 bottom-2 w-0.5"
          style={{ backgroundColor: 'var(--border)' }}
        />

        <ul className="space-y-3 pl-5">
          {visibleEvents.map((event) => (
            <li key={event.id} className="flex items-start gap-3 relative">
              {/* Timeline dot */}
              <div
                className="absolute -left-5 mt-1 w-2.5 h-2.5 rounded-full border-2 flex-shrink-0"
                style={{
                  borderColor: 'var(--border)',
                  backgroundColor: 'var(--raised)',
                }}
              />

              {/* Date badge */}
              <span
                className="text-xs font-medium rounded-full px-2 py-0.5 flex-shrink-0"
                style={getDateBadgeStyle(event.startAt)}
              >
                {formatEventDate(event.startAt, event.allDay)}
              </span>

              {/* Title */}
              <span className="text-sm text-[var(--text)] leading-snug">{event.title}</span>
            </li>
          ))}
        </ul>
      </div>

      {hasMore && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-3 text-xs text-[var(--accent)] hover:text-[var(--accent-h)] transition-colors"
        >
          Show all {events.length} events
        </button>
      )}
    </div>
  );
}
