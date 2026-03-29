import { queryOne, execute } from '../db/pg.js';

export async function getSetting(key: string): Promise<string | null> {
  try {
    const row = await queryOne<{ value: string }>(
      'SELECT value FROM workspace_settings WHERE key = $1', [key]
    );
    return row?.value ?? null;
  } catch { return null; }
}

export async function setSetting(key: string, value: string): Promise<void> {
  await execute(
    `INSERT INTO workspace_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, value]
  );
}
