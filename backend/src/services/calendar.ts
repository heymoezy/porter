import { google } from 'googleapis';
import { decryptCredential, encryptCredential } from '../lib/credential-crypto.js';
import { pool } from '../db/client.js';
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
  let query: CalendarConnection | undefined;
  if (connectionId) {
    query = (await pool.query(
      `SELECT id, meta_json, meta_encrypted FROM workspace_connections
       WHERE id = $1 AND provider = 'google_calendar' AND status = 'connected' LIMIT 1`,
      [connectionId]
    )).rows[0] as CalendarConnection | undefined;
  } else {
    query = (await pool.query(
      `SELECT id, meta_json, meta_encrypted FROM workspace_connections
       WHERE provider = 'google_calendar' AND status = 'connected' LIMIT 1`
    )).rows[0] as CalendarConnection | undefined;
  }

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
  auth.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      const updated: CalendarCredentials = {
        ...creds,
        access_token: tokens.access_token,
      };
      const encrypted = encryptCredential(JSON.stringify(updated));
      await pool.query(`
        UPDATE workspace_connections
        SET meta_json = $1, meta_encrypted = 1, updated_at = EXTRACT(EPOCH FROM NOW())
        WHERE id = $2
      `, [encrypted, query!.id]);
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
      await pool.query(`
        UPDATE workspace_connections
        SET status = 'needs_reauth', last_error = 'Token expired — re-authenticate', updated_at = EXTRACT(EPOCH FROM NOW())
        WHERE id = $1
      `, [client.connectionId]);
      console.warn('[calendar] 401 on connection %s — marked needs_reauth', client.connectionId);
    } else {
      throw err;
    }
    return 0;
  }

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
        const proj = (await pool.query(
          `SELECT id FROM projects WHERE name = $1 LIMIT 1`,
          [projectName]
        )).rows[0] as { id: string } | undefined;
        if (proj) projectId = proj.id;
      }
    }

    await pool.query(`
      INSERT INTO calendar_events
        (id, connection_id, project_id, google_event_id, title, start_at, end_at, all_day, synced_at)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, EXTRACT(EPOCH FROM NOW()))
      ON CONFLICT (id) DO UPDATE SET
        connection_id = EXCLUDED.connection_id,
        project_id = EXCLUDED.project_id,
        google_event_id = EXCLUDED.google_event_id,
        title = EXCLUDED.title,
        start_at = EXCLUDED.start_at,
        end_at = EXCLUDED.end_at,
        all_day = EXCLUDED.all_day,
        synced_at = EXTRACT(EPOCH FROM NOW())
    `, [
      event.id,
      client.connectionId,
      projectId,
      event.id,
      event.summary,
      startAt,
      endAt,
      allDay,
    ]);
    count++;
  }

  // Update last sync timestamp
  await pool.query(`
    UPDATE workspace_connections SET last_sync_at = EXTRACT(EPOCH FROM NOW()), updated_at = EXTRACT(EPOCH FROM NOW())
    WHERE id = $1
  `, [client.connectionId]);

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
export async function getProjectCalendarEvents(projectId: string): Promise<{
  id: string;
  title: string;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
}[]> {
  const rows = (await pool.query(`
    SELECT id, title, start_at, end_at, all_day
    FROM calendar_events
    WHERE project_id = $1
    ORDER BY start_at ASC
  `, [projectId])).rows as {
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
export async function checkCalendarDeadlines(): Promise<number> {
  const now = new Date();
  const in24h = new Date(now.getTime() + 86400000);
  const nowIso = now.toISOString();
  const in24hIso = in24h.toISOString();

  const approaching = (await pool.query(`
    SELECT id, title, start_at, project_id
    FROM calendar_events
    WHERE project_id IS NOT NULL
      AND start_at >= $1
      AND start_at <= $2
  `, [nowIso, in24hIso])).rows as {
    id: string;
    title: string;
    start_at: string;
    project_id: string;
  }[];

  let inserted = 0;
  for (const event of approaching) {
    const subscribers = await getEventSubscribers('deadline-approaching', event.project_id);
    for (const agentId of subscribers) {
      // Dedup: skip if a pending job already exists for this agent + event within dedup window
      const existing = (await pool.query(`
        SELECT 1 FROM agent_jobs
        WHERE agent_id = $1
          AND trigger_type = 'deadline-approaching'
          AND project_id = $2
          AND status = 'pending'
          AND created_at > EXTRACT(EPOCH FROM NOW()) - $3
        LIMIT 1
      `, [agentId, event.project_id, DEDUP_WINDOW_SEC])).rows[0];

      if (existing) continue;

      const jobId = crypto.randomUUID();
      const triggerData = JSON.stringify({
        calendarEventId: event.id,
        calendarTitle: event.title,
        startAt: event.start_at,
        projectId: event.project_id,
        source: 'google_calendar',
      });

      await pool.query(`
        INSERT INTO agent_jobs
          (id, agent_id, project_id, trigger_type, trigger_data, prompt, status, scheduled_for)
        VALUES
          ($1, $2, $3, 'deadline-approaching', $4, $5, 'pending', EXTRACT(EPOCH FROM NOW()))
      `, [
        jobId,
        agentId,
        event.project_id,
        triggerData,
        `Calendar event approaching: "${event.title}" starts at ${event.start_at}. Review and prepare accordingly.`,
      ]);

      inserted++;
    }
  }

  return inserted;
}
