import pg from 'pg';

export async function migrateRpgV1(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Idempotency check
    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = 'rpg_v1'`
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }

    // ── 1. ALTER agent_templates — add RPG columns (SCH-01, SCH-06, SCH-07) ──
    await client.query(`
      ALTER TABLE agent_templates
        ADD COLUMN IF NOT EXISTS shell             TEXT DEFAULT 'builder',
        ADD COLUMN IF NOT EXISTS shell_icon        TEXT DEFAULT '',
        ADD COLUMN IF NOT EXISTS shell_color       TEXT DEFAULT '',
        ADD COLUMN IF NOT EXISTS intelligence      JSONB DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS supports          JSONB DEFAULT '[]',
        ADD COLUMN IF NOT EXISTS equipment_slots   JSONB DEFAULT '[]',
        ADD COLUMN IF NOT EXISTS passive_tree      JSONB DEFAULT '[]',
        ADD COLUMN IF NOT EXISTS level             INTEGER DEFAULT 1,
        ADD COLUMN IF NOT EXISTS xp               INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS star_level        INTEGER DEFAULT 1,
        ADD COLUMN IF NOT EXISTS rarity            TEXT DEFAULT 'common',
        ADD COLUMN IF NOT EXISTS elo_rating        INTEGER DEFAULT 1200,
        ADD COLUMN IF NOT EXISTS specialties       JSONB DEFAULT '[]',
        ADD COLUMN IF NOT EXISTS rpg_enabled       INTEGER DEFAULT 0
    `);

    // ── 2. ALTER template_skills — add skill performance columns (SCH-05) ────
    await client.query(`
      ALTER TABLE template_skills
        ADD COLUMN IF NOT EXISTS success_rate_30d  DOUBLE PRECISION DEFAULT 0,
        ADD COLUMN IF NOT EXISTS total_uses        INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS last_used         DOUBLE PRECISION
    `);

    // ── 3. CREATE agent_rpg_stats — derived stat cache ────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_rpg_stats (
        id              TEXT PRIMARY KEY,
        template_id     TEXT NOT NULL REFERENCES agent_templates(id) ON DELETE CASCADE,
        quality         DOUBLE PRECISION DEFAULT 0,
        speed           DOUBLE PRECISION DEFAULT 0,
        efficiency      DOUBLE PRECISION DEFAULT 0,
        reliability     DOUBLE PRECISION DEFAULT 0,
        combo           DOUBLE PRECISION DEFAULT 0,
        xp              INTEGER DEFAULT 0,
        level           INTEGER DEFAULT 1,
        stars           INTEGER DEFAULT 1,
        rarity          TEXT DEFAULT 'common',
        agent_class     TEXT DEFAULT 'striker',
        elo             INTEGER DEFAULT 1200,
        weapon_model    TEXT,
        armor_prompt_id TEXT,
        accessory1_tool TEXT,
        accessory2_tool TEXT,
        set_bonus_active INTEGER DEFAULT 0,
        specialties     JSONB DEFAULT '[]',
        dispatch_count  INTEGER DEFAULT 0,
        battle_count    INTEGER DEFAULT 0,
        last_computed   DOUBLE PRECISION,
        created_at      DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        updated_at      DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_agent_rpg_stats_template_id
        ON agent_rpg_stats(template_id)
    `);

    // ── 4. CREATE battles — battle records (SCH-02) ───────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS battles (
        id                      TEXT PRIMARY KEY,
        challenger_id           TEXT NOT NULL,
        defender_id             TEXT NOT NULL,
        prompt                  TEXT NOT NULL,
        domain                  TEXT DEFAULT 'general',
        status                  TEXT DEFAULT 'pending',
        winner_id               TEXT,
        judge_model             TEXT,
        judge_scores            JSONB DEFAULT '{}',
        challenger_elo_before   INTEGER,
        defender_elo_before     INTEGER,
        challenger_elo_after    INTEGER,
        defender_elo_after      INTEGER,
        challenger_dispatch_id  TEXT,
        defender_dispatch_id    TEXT,
        judge_dispatch_id       TEXT,
        initiated_by            TEXT,
        spectators              JSONB DEFAULT '[]',
        replay_data             JSONB DEFAULT '{}',
        created_at              DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        completed_at            DOUBLE PRECISION
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_battles_challenger_id ON battles(challenger_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_battles_defender_id ON battles(defender_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_battles_status ON battles(status)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_battles_created_at ON battles(created_at DESC)
    `);

    // ── 5. CREATE battle_rounds — per-round detail (SCH-04 part 1) ───────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS battle_rounds (
        id                      TEXT PRIMARY KEY,
        battle_id               TEXT NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
        round_num               INTEGER NOT NULL,
        challenger_response     TEXT,
        defender_response       TEXT,
        challenger_tokens       INTEGER,
        defender_tokens         INTEGER,
        challenger_latency_ms   INTEGER,
        defender_latency_ms     INTEGER,
        round_winner            TEXT,
        created_at              DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_battle_rounds_battle_id ON battle_rounds(battle_id)
    `);

    // ── 6. CREATE battle_judgments — ensemble judge scoring (SCH-04 part 2) ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS battle_judgments (
        id               TEXT PRIMARY KEY,
        battle_id        TEXT NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
        judge_model      TEXT NOT NULL,
        quality_score    DOUBLE PRECISION,
        speed_score      DOUBLE PRECISION,
        efficiency_score DOUBLE PRECISION,
        style_score      DOUBLE PRECISION,
        rationale        TEXT,
        verdict          TEXT,
        confidence       DOUBLE PRECISION,
        raw_response     TEXT,
        created_at       DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_battle_judgments_battle_id ON battle_judgments(battle_id)
    `);

    // ── 7. CREATE agent_bonds — COMBO stat tracking (SCH-03) ─────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_bonds (
        id            TEXT PRIMARY KEY,
        agent_a_id    TEXT NOT NULL,
        agent_b_id    TEXT NOT NULL,
        chain_count   INTEGER DEFAULT 0,
        success_count INTEGER DEFAULT 0,
        combo_score   DOUBLE PRECISION DEFAULT 0,
        last_chained  DOUBLE PRECISION,
        created_at    DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        UNIQUE (agent_a_id, agent_b_id)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_agent_bonds_a ON agent_bonds(agent_a_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_agent_bonds_b ON agent_bonds(agent_b_id)
    `);

    // ── 8. CREATE session_registry — AI dispatch session tracking ─────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS session_registry (
        id             TEXT PRIMARY KEY,
        chat_id        TEXT,
        agent_id       TEXT,
        username       TEXT,
        gateway_type   TEXT,
        model_name     TEXT,
        token_budget   INTEGER DEFAULT 0,
        tokens_used    INTEGER DEFAULT 0,
        context_msgs   INTEGER DEFAULT 0,
        status         TEXT DEFAULT 'active',
        metadata       JSONB DEFAULT '{}',
        created_at     DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        last_active_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        closed_at      DOUBLE PRECISION
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_session_registry_chat_id
        ON session_registry(chat_id)
        WHERE chat_id IS NOT NULL
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_session_registry_status ON session_registry(status)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_session_registry_agent_id
        ON session_registry(agent_id)
        WHERE agent_id IS NOT NULL
    `);

    // ── 9. CREATE msg_bus_events — inter-gateway message audit log ────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS msg_bus_events (
        id               TEXT PRIMARY KEY,
        correlation_id   TEXT,
        source_agent     TEXT,
        source_gateway   TEXT,
        target_agent     TEXT,
        target_gateway   TEXT,
        intent           TEXT,
        payload          JSONB DEFAULT '{}',
        response_payload JSONB,
        hop_count        INTEGER DEFAULT 0,
        latency_ms       INTEGER,
        dispatch_log_id  TEXT,
        status           TEXT DEFAULT 'pending',
        created_at       DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        delivered_at     DOUBLE PRECISION
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_msg_bus_events_correlation_id
        ON msg_bus_events(correlation_id)
        WHERE correlation_id IS NOT NULL
    `);

    // ── 10. CREATE intelligence_patterns — dispatch signal log ────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS intelligence_patterns (
        id                    TEXT PRIMARY KEY,
        pattern_type          TEXT NOT NULL,
        gateway_type          TEXT,
        agent_id              TEXT,
        summary               TEXT NOT NULL,
        evidence              JSONB DEFAULT '[]',
        confidence            INTEGER DEFAULT 50,
        promoted_to_concept_id TEXT,
        status                TEXT DEFAULT 'raw',
        created_at            DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        reviewed_at           DOUBLE PRECISION
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_intelligence_patterns_status
        ON intelligence_patterns(status)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_intelligence_patterns_pattern_type
        ON intelligence_patterns(pattern_type)
    `);

    // ── Idempotency footer ─────────────────────────────────────────────────────
    await client.query(`INSERT INTO schema_migrations (id) VALUES ('rpg_v1')`);
    await client.query('COMMIT');
    console.log('[migrate-rpg] rpg_v1 applied');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
