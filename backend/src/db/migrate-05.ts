import { sqlite } from './client.js';

export function migrate05GuidedWizard() {
  // Idempotent: check schema_migrations before applying
  const applied = sqlite.prepare(
    `SELECT 1 FROM schema_migrations WHERE id = 'phase05_wizard_state'`
  ).get();
  if (applied) return;

  // Add wizard_state column to projects table for in-progress wizard state (JSON)
  try {
    sqlite.exec(`ALTER TABLE projects ADD COLUMN wizard_state TEXT DEFAULT NULL`);
  } catch {
    // Column may already exist — safe to ignore
  }

  // Mark migration complete
  sqlite.prepare(
    `INSERT INTO schema_migrations (id) VALUES ('phase05_wizard_state')`
  ).run();
}
