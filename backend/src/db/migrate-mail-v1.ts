/**
 * migrate-mail-v1.ts — Mail Subsystem Foundation
 *
 * Creates 10 tables for the Porter mail subsystem:
 *   mail_domains, mailboxes, agent_mailboxes, mail_aliases,
 *   mail_threads, mail_messages, mail_deliveries,
 *   newsletter_sources, newsletter_subscriptions, mail_learning_events
 */

import pg from 'pg';

export async function migrateMailV1(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Idempotency check
    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = 'mail_v1'`,
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }

    // ── 1. mail_domains ──────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mail_domains (
        id                  TEXT PRIMARY KEY,
        domain              TEXT UNIQUE NOT NULL,
        provider            TEXT NOT NULL DEFAULT 'stalwart',
        status              TEXT NOT NULL DEFAULT 'pending_dns',
        is_primary          INTEGER NOT NULL DEFAULT 0,
        dkim_selector       TEXT,
        dkim_public_key     TEXT,
        return_path_domain  TEXT,
        dns_last_checked_at DOUBLE PRECISION,
        dns_status_json     JSONB DEFAULT '{}',
        created_at          DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        updated_at          DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);
    console.log('[migrate-mail-v1] mail_domains created');

    // ── 2. mailboxes ─────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mailboxes (
        id                   TEXT PRIMARY KEY,
        domain_id            TEXT NOT NULL,
        provider_mailbox_id  TEXT,
        address              TEXT UNIQUE NOT NULL,
        local_part           TEXT NOT NULL,
        display_name         TEXT NOT NULL DEFAULT '',
        mailbox_type         TEXT NOT NULL DEFAULT 'agent',
        status               TEXT NOT NULL DEFAULT 'active',
        auth_type            TEXT NOT NULL DEFAULT 'managed_password',
        secret_ref           TEXT,
        quota_bytes          BIGINT DEFAULT 0,
        last_sync_at         DOUBLE PRECISION,
        last_error           TEXT,
        created_at           DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        updated_at           DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);
    console.log('[migrate-mail-v1] mailboxes created');

    // ── 3. agent_mailboxes ───────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_mailboxes (
        agent_id    TEXT NOT NULL,
        mailbox_id  TEXT NOT NULL,
        role        TEXT NOT NULL DEFAULT 'primary',
        created_at  DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        UNIQUE (agent_id, mailbox_id)
      )
    `);
    console.log('[migrate-mail-v1] agent_mailboxes created');

    // ── 4. mail_aliases ──────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mail_aliases (
        id               TEXT PRIMARY KEY,
        mailbox_id       TEXT NOT NULL,
        alias_address    TEXT UNIQUE NOT NULL,
        receive_enabled  INTEGER NOT NULL DEFAULT 1,
        send_as_enabled  INTEGER NOT NULL DEFAULT 1,
        created_at       DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        updated_at       DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);
    console.log('[migrate-mail-v1] mail_aliases created');

    // ── 5. mail_threads ──────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mail_threads (
        id                  TEXT PRIMARY KEY,
        mailbox_id          TEXT NOT NULL,
        provider_thread_id  TEXT,
        conversation_id     TEXT,
        subject_canonical   TEXT NOT NULL DEFAULT '',
        last_message_at     DOUBLE PRECISION,
        message_count       INTEGER NOT NULL DEFAULT 0,
        participants_json   JSONB DEFAULT '[]',
        created_at          DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        updated_at          DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);
    console.log('[migrate-mail-v1] mail_threads created');

    // ── 6. mail_messages ─────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mail_messages (
        id                      TEXT PRIMARY KEY,
        mailbox_id              TEXT NOT NULL,
        thread_id               TEXT,
        provider_message_id     TEXT,
        internet_message_id     TEXT,
        in_reply_to             TEXT,
        references_header       TEXT,
        direction               TEXT NOT NULL,
        folder                  TEXT NOT NULL,
        status                  TEXT NOT NULL,
        from_address            TEXT NOT NULL,
        from_name               TEXT NOT NULL DEFAULT '',
        to_addresses_json       JSONB DEFAULT '[]',
        cc_addresses_json       JSONB DEFAULT '[]',
        bcc_addresses_json      JSONB DEFAULT '[]',
        reply_to_addresses_json JSONB DEFAULT '[]',
        subject                 TEXT NOT NULL DEFAULT '',
        snippet                 TEXT NOT NULL DEFAULT '',
        text_body               TEXT NOT NULL DEFAULT '',
        html_body               TEXT NOT NULL DEFAULT '',
        headers_json            JSONB DEFAULT '{}',
        attachments_json        JSONB DEFAULT '[]',
        provider_raw_ref        TEXT,
        received_at             DOUBLE PRECISION,
        sent_at                 DOUBLE PRECISION,
        read_at                 DOUBLE PRECISION,
        created_at              DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        updated_at              DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);
    // Indexes for mail_messages
    await client.query(`CREATE INDEX IF NOT EXISTS idx_mail_messages_mbx_folder_updated ON mail_messages(mailbox_id, folder, updated_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_mail_messages_thread_created ON mail_messages(thread_id, created_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_mail_messages_internet_msg_id ON mail_messages(internet_message_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_mail_messages_provider_msg_id ON mail_messages(provider_message_id)`);
    console.log('[migrate-mail-v1] mail_messages created with indexes');

    // ── 7. mail_deliveries ───────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mail_deliveries (
        id            TEXT PRIMARY KEY,
        message_id    TEXT NOT NULL,
        recipient     TEXT NOT NULL,
        attempt       INTEGER NOT NULL DEFAULT 1,
        status        TEXT NOT NULL,
        smtp_response TEXT,
        remote_mx     TEXT,
        queued_at     DOUBLE PRECISION,
        completed_at  DOUBLE PRECISION,
        created_at    DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);
    console.log('[migrate-mail-v1] mail_deliveries created');

    // ── 8. newsletter_sources ────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS newsletter_sources (
        id              TEXT PRIMARY KEY,
        mailbox_id      TEXT,
        source_type     TEXT NOT NULL,
        source_key      TEXT NOT NULL,
        sender_pattern  TEXT,
        display_name    TEXT NOT NULL DEFAULT '',
        trust_level     TEXT NOT NULL DEFAULT 'review',
        topic_tags_json JSONB DEFAULT '[]',
        metadata_json   JSONB DEFAULT '{}',
        active          INTEGER NOT NULL DEFAULT 1,
        created_at      DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        updated_at      DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);
    console.log('[migrate-mail-v1] newsletter_sources created');

    // ── 9. newsletter_subscriptions ──────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS newsletter_subscriptions (
        id                TEXT PRIMARY KEY,
        agent_id          TEXT NOT NULL,
        mailbox_id        TEXT NOT NULL,
        source_id         TEXT NOT NULL,
        status            TEXT NOT NULL DEFAULT 'active',
        delivery_mode     TEXT NOT NULL DEFAULT 'digest',
        last_received_at  DOUBLE PRECISION,
        last_processed_at DOUBLE PRECISION,
        created_at        DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        updated_at        DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);
    console.log('[migrate-mail-v1] newsletter_subscriptions created');

    // ── 10. mail_learning_events ─────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mail_learning_events (
        id           TEXT PRIMARY KEY,
        message_id   TEXT NOT NULL,
        agent_id     TEXT,
        skill_id     TEXT,
        event_type   TEXT NOT NULL,
        payload_json JSONB DEFAULT '{}',
        created_at   DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);
    console.log('[migrate-mail-v1] mail_learning_events created');

    // ── Mark migration complete ──────────────────────────────────────────────
    await client.query(`INSERT INTO schema_migrations (id) VALUES ('mail_v1')`);
    await client.query('COMMIT');
    console.log('[migrate-mail-v1] migration complete — 10 tables created');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[migrate-mail-v1] migration failed, rolled back:', err);
    throw err;
  } finally {
    client.release();
  }
}
