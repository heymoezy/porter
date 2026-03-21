import { google } from 'googleapis';
import { decryptCredential, encryptCredential } from '../lib/credential-crypto.js';
import { sqlite } from '../db/client.js';
import { getEventSubscribers } from './event-triggers.js';
import crypto from 'crypto';

const DEDUP_WINDOW_SEC = 60;

interface CalendarConnection {
  id: string;
  meta_json: string;
  meta_encrypted: number;
}

interface CalendarCredentials {
  access_token: string;
  refresh_token: string;
  email?: string;
}

/**
 * Get an authenticated Google Calendar API client.
 * Reads the first connected google_calendar workspace connection.
 * Returns null if no connected calendar exists.
 */
async function getCalendarClient(connectionId?: string): Promise<{
  calendar: ReturnType<typeof google.calendar>;
  connectionId: string;
} | null> {
  const query = connectionId
    ? sqlite.prepare(
        `SELECT id, meta_json, meta_encrypted FROM workspace_connections
         WHERE id = @connectionId AND provider = 'google_calendar' AND status = 'connected' LIMIT 1`
      ).get({ connectionId }) as CalendarConnection | undefined
    : sqlite.prepare(
        `SELECT id, meta_json, meta_encrypted FROM workspace_connections
         WHERE provider = 'google_calendar' AND status = 'connected' LIMIT 1`
      ).get() as CalendarConnection | undefined;

  if (!query) return null;

  const rawMeta = query.meta_encrypted ? decryptCredential(query.meta_json) : query.meta_json;
  const creds = JSON.parse(rawMeta) as CalendarCredentials;

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );

  auth.setCredentials({
    access_token: creds.access_token,
    refresh_token: creds.refresh_token,
  });

  // Auto-update stored credentials on token refresh
  auth.on('tokens', (tokens) => {
    if (tokens.access_token) {
      const updated: CalendarCredentials = {
        ...creds,
        access_token: tokens.access_token,
      };
      const encrypted = encryptCredential(JSON.stringify(updated));
      sqlite.prepare(`
        UPDATE workspace_connections
        SET meta_json = @meta, meta_encrypted = 1, updated_at = strftime('%s','now')
        WHERE id = @id
      `).run({ meta: encrypted, id: query.id });
    }
  });

  return {
    calendar: google.calendar({ version: 'v3', auth }),
    connectionId: query.id,
  };
}

/**
 * Sync events from Google Calendar into the calendar_events table.
 * Fetches events for the next 30 days from the primary calendar.
 * Returns the number of events synced.
 * On 401, marks the connection as needs_reauth.
 */
export async function syncCalendarEvents(connectionId?: string): Promise<number> {
  const client = await getCalendarClient(connectionId);
  if (!client) return 0;

  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + 30 * 86400000).toISOString();

  let events;
  try {
    const response = await client.calendar.events.list({
      calendarId: 'primary',
      timeMin,
      timeMax,
      maxResults: 100,
      singleEvents: true,
      orderBy: 'startTime',
    });
    events = response.data.items ?? [];
  } catch (err: unknown) {
    const status = (err as { code?: number })?.code;
    if (status === 401) {
      sqlite.prepare(`
        UPDATE workspace_connections
        SET status = 'needs_reauth', last_error = 'Token expired — re-authenticate', updated_at = strftime('%s','now')
        WHERE id = @id
      `).run({ id: client.connectionId });
      console.warn('[calendar] 401 on connection %s — marked needs_reauth', client.connectionId);
    } else {
      throw err;
    }
    return 0;
  }

  const upsert = sqlite.prepare(`
    INSERT OR REPLACE INTO calendar_events
      (id, connection_id, project_id, google_event_id, title, start_at, end_at, all_day, synced_at)
    VALUES
      (@id, @connectionId, @projectId, @googleEventId, @title, @startAt, @endAt, @allDay, unixepoch('now'))
  `);

  let count = 0;
  for (const event of events) {
    if (!event.id || !event.summary) continue;

    const startAt = event.start?.dateTime ?? event.start?.date ?? '';
    const endAt = event.end?.dateTime ?? event.end?.date ?? null;
    const allDay = event.start?.dateTime ? 0 : 1;

    // Attempt to match event to a project via description or extendedProperties
    let projectId: string | null = null;
    const desc = event.description ?? '';
    const extProps = event.extendedProperties?.private ?? {};
    const extShared = event.extendedProperties?.shared ?? {};

    // Check extendedProperties first (set by pushMilestoneToCalendar)
    if (extProps['porter_project_id']) {
      projectId = extProps['porter_project_id'];
    } else if (extShared['porter_project_id']) {
      projectId = extShared['porter_project_id'];
    } else if (desc) {
      // Try to match project name from description "Project: <name>"
      const match = desc.match(/^Project:\s*(.+)$/im);
      if (match) {
        const projectName = match[1].trim();
        const proj = sqlite.prepare(
          `SELECT id FROM projects WHERE name = @name LIMIT 1`
        ).get({ name: projectName }) as { id: string } | undefined;
        if (proj) projectId = proj.id;
      }
    }

    upsert.run({
      id: event.id,
      connectionId: client.connectionId,
      projectId,
      googleEventId: event.id,
      title: event.summary,
      startAt,
      endAt,
      allDay,
    });
    count++;
  }

  // Update last sync timestamp
  sqlite.prepare(`
    UPDATE workspace_connections SET last_sync_at = unixepoch('now'), updated_at = strftime('%s','now')
    WHERE id = @id
  `).run({ id: client.connectionId });

  return count;
}

/**
 * Push a project milestone to Google Calendar as an all-day event.
 * Returns the Google event ID of the created event.
 */
export async function pushMilestoneToCalendar(params: {
  title: string;
  date: string;
  projectName: string;
  projectId?: string;
  connectionId?: string;
}): Promise<string> {
  const client = await getCalendarClient(params.connectionId);
  if (!client) throw new Error('No connected Google Calendar found');

  const response = await client.calendar.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary: 'Porter: ' + params.title,
      description: 'Project: ' + params.projectName,
      start: { date: params.date },
      end: { date: params.date },
      extendedProperties: params.projectId
        ? { private: { porter_project_id: params.projectId } }
        : undefined,
    },
  });

  return response.data.id ?? '';
}

/**
 * Get all calendar events linked to a project.
 */
export function getProjectCalendarEvents(projectId: string): {
  id: string;
  title: string;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
}[] {
  const rows = sqlite.prepare(`
    SELECT id, title, start_at, end_at, all_day
    FROM calendar_events
    WHERE project_id = @projectId
    ORDER BY start_at ASC
  `).all({ projectId }) as {
    id: string;
    title: string;
    start_at: string;
    end_at: string | null;
    all_day: number;
  }[];

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    startAt: row.start_at,
    endAt: row.end_at,
    allDay: row.all_day === 1,
  }));
}

/**
 * Check calendar events within the next 24 hours and fire deadline-approaching
 * agent jobs for any events linked to a project.
 * Uses the same event trigger mechanism as checkDeadlineTriggers in event-triggers.ts.
 * Returns the number of jobs created.
 */
export function checkCalendarDeadlines(): number {
  const now = new Date();
  const in24h = new Date(now.getTime() + 86400000);
  const nowIso = now.toISOString();
  const in24hIso = in24h.toISOString();

  const approaching = sqlite.prepare(`
    SELECT id, title, start_at, project_id
    FROM calendar_events
    WHERE project_id IS NOT NULL
      AND start_at >= @now
      AND start_at <= @in24h
  `).all({ now: nowIso, in24h: in24hIso }) as {
    id: string;
    title: string;
    start_at: string;
    project_id: string;
  }[];

  let inserted = 0;
  for (const event of approaching) {
    const subscribers = getEventSubscribers('deadline-approaching', event.project_id);
    for (const agentId of subscribers) {
      // Dedup: skip if a pending job already exists for this agent + event within dedup window
      const existing = sqlite.prepare(`
        SELECT 1 FROM agent_jobs
        WHERE agent_id = @agentId
          AND trigger_type = 'deadline-approaching'
          AND project_id = @projectId
          AND status = 'pending'
          AND created_at > unixepoch('now') - @dedupWindow
        LIMIT 1
      `).get({ agentId, projectId: event.project_id, dedupWindow: DEDUP_WINDOW_SEC });

      if (existing) continue;

      const jobId = crypto.randomUUID();
      const triggerData = JSON.stringify({
        calendarEventId: event.id,
        calendarTitle: event.title,
        startAt: event.start_at,
        projectId: event.project_id,
        source: 'google_calendar',
      });

      sqlite.prepare(`
        INSERT INTO agent_jobs
          (id, agent_id, project_id, trigger_type, trigger_data, prompt, status, scheduled_for)
        VALUES
          (@id, @agentId, @projectId, 'deadline-approaching', @triggerData, @prompt, 'pending', unixepoch('now'))
      `).run({
        id: jobId,
        agentId,
        projectId: event.project_id,
        triggerData,
        prompt: `Calendar event approaching: "${event.title}" starts at ${event.start_at}. Review and prepare accordingly.`,
      });

      inserted++;
    }
  }

  return inserted;
}
