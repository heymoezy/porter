import pg from 'pg';

export async function migrateConsolidated(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Extensions
    await client.query(`CREATE EXTENSION IF NOT EXISTS vector`);

    // Idempotency check
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);
    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = 'consolidated_pg_v1'`
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }

    // ── Users & Sessions ──────────────────────────────────────────────────────

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY,
        display_name TEXT,
        full_name TEXT,
        email TEXT,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        role TEXT DEFAULT 'operator',
        email_verified INTEGER DEFAULT 0,
        status TEXT DEFAULT 'active',
        created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        country TEXT,
        city TEXT,
        timezone TEXT,
        company TEXT,
        job_title TEXT,
        phone TEXT,
        bio TEXT,
        social_x TEXT,
        social_linkedin TEXT,
        social_github TEXT,
        avatar_url TEXT,
        language TEXT DEFAULT 'en',
        suspended_at DOUBLE PRECISION,
        suspension_reason TEXT,
        terms_accepted_at DOUBLE PRECISION,
        last_ip TEXT,
        signup_source TEXT,
        lifetime_free INTEGER DEFAULT 0
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        expires DOUBLE PRECISION NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        last_seen_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);

    // ── Tasks ─────────────────────────────────────────────────────────────────

    await client.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        username TEXT,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        priority TEXT NOT NULL DEFAULT 'normal',
        phase TEXT,
        created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        updated_at DOUBLE PRECISION,
        completed_at DOUBLE PRECISION,
        assigned_agent_id TEXT,
        tokens_used INTEGER DEFAULT 0,
        time_minutes INTEGER DEFAULT 0,
        result TEXT,
        tags JSONB DEFAULT '[]'::jsonb,
        sort_order INTEGER DEFAULT 0
      )
    `);

    // ── Chats ─────────────────────────────────────────────────────────────────

    await client.query(`
      CREATE TABLE IF NOT EXISTS chats (
        id TEXT PRIMARY KEY,
        title TEXT,
        project_id TEXT,
        username TEXT,
        model_id TEXT,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        updated_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        model_id TEXT
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_attachments (
        id TEXT PRIMARY KEY,
        message_id INTEGER REFERENCES chat_messages(id) ON DELETE CASCADE,
        chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        content_type TEXT,
        size INTEGER,
        data TEXT,
        created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);

    // ── Projects ──────────────────────────────────────────────────────────────

    await client.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT,
        type TEXT DEFAULT 'custom',
        status TEXT DEFAULT 'active',
        description TEXT,
        owner_id TEXT NOT NULL,
        milestones JSONB DEFAULT '[]'::jsonb,
        artifacts JSONB DEFAULT '[]'::jsonb,
        links JSONB DEFAULT '[]'::jsonb,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        updated_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        deadline TEXT
      )
    `);

    // ── Personas (Agents) ─────────────────────────────────────────────────────

    await client.query(`
      CREATE TABLE IF NOT EXISTS personas (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT DEFAULT '',
        avatar TEXT DEFAULT '',
        preferred_backend TEXT,
        fallback_backends JSONB DEFAULT '[]'::jsonb,
        status TEXT DEFAULT 'idle',
        soul_hash TEXT DEFAULT '',
        agent_group TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        last_active TEXT,
        config JSONB DEFAULT '{}'::jsonb,
        sort_order INTEGER DEFAULT 50,
        owner TEXT DEFAULT '',
        is_system INTEGER DEFAULT 0,
        is_public INTEGER DEFAULT 1,
        is_locked INTEGER DEFAULT 0,
        is_master INTEGER DEFAULT 0,
        orchestrator_only INTEGER DEFAULT 0,
        is_temporary INTEGER DEFAULT 0,
        managed_by_porter INTEGER DEFAULT 0,
        appearance_style TEXT DEFAULT '',
        appearance_spec JSONB DEFAULT '{}'::jsonb,
        skin_asset_path TEXT DEFAULT '',
        portrait_asset_path TEXT DEFAULT '',
        heartbeat_enabled INTEGER DEFAULT 0,
        heartbeat_cron TEXT DEFAULT '',
        last_heartbeat TEXT,
        template_id TEXT
      )
    `);

    // ── Agent Jobs & Activity ─────────────────────────────────────────────────

    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_jobs (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        project_id TEXT,
        parent_agent_id TEXT,
        trigger_type TEXT NOT NULL DEFAULT 'scheduled',
        trigger_data JSONB DEFAULT '{}'::jsonb,
        prompt TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        scheduled_for DOUBLE PRECISION NOT NULL,
        started_at DOUBLE PRECISION,
        completed_at DOUBLE PRECISION,
        worker_id TEXT,
        attempt_count INTEGER DEFAULT 0,
        result TEXT,
        error TEXT,
        created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_activity (
        id SERIAL PRIMARY KEY,
        agent_id TEXT NOT NULL,
        job_id TEXT,
        project_id TEXT,
        event_type TEXT NOT NULL,
        summary TEXT,
        detail TEXT,
        created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);

    // ── Decision Log ──────────────────────────────────────────────────────────

    await client.query(`
      CREATE TABLE IF NOT EXISTS decision_log (
        id SERIAL PRIMARY KEY,
        decision_type TEXT NOT NULL,
        chosen TEXT NOT NULL,
        reasoning TEXT NOT NULL,
        alternatives JSONB DEFAULT '[]'::jsonb,
        project_id TEXT,
        agent_id TEXT,
        job_id TEXT,
        created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);

    // ── Token Usage ───────────────────────────────────────────────────────────

    await client.query(`
      CREATE TABLE IF NOT EXISTS token_usage_daily (
        id SERIAL PRIMARY KEY,
        model TEXT NOT NULL,
        date TEXT NOT NULL,
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        request_count INTEGER DEFAULT 0,
        created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);

    // ── External Connections ──────────────────────────────────────────────────

    await client.query(`
      CREATE TABLE IF NOT EXISTS workspace_connections (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'api_key',
        status TEXT NOT NULL DEFAULT 'disconnected',
        display_name TEXT DEFAULT '',
        scopes_json JSONB DEFAULT '[]'::jsonb,
        tools_json JSONB DEFAULT '[]'::jsonb,
        last_sync_at DOUBLE PRECISION DEFAULT 0,
        last_error TEXT DEFAULT '',
        installed_by TEXT DEFAULT '',
        meta_json JSONB DEFAULT '{}'::jsonb,
        meta_encrypted INTEGER DEFAULT 0,
        created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        updated_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS project_connections (
        id SERIAL PRIMARY KEY,
        project_id TEXT NOT NULL,
        connection_id TEXT NOT NULL,
        access_mode TEXT NOT NULL DEFAULT 'read',
        enabled_tools_json JSONB DEFAULT '[]'::jsonb,
        status TEXT NOT NULL DEFAULT 'active',
        attached_by TEXT DEFAULT '',
        attached_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS calendar_events (
        id TEXT PRIMARY KEY,
        connection_id TEXT NOT NULL,
        project_id TEXT,
        google_event_id TEXT NOT NULL,
        title TEXT NOT NULL,
        start_at TEXT NOT NULL,
        end_at TEXT,
        all_day INTEGER DEFAULT 0,
        synced_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);

    // ── Billing ───────────────────────────────────────────────────────────────

    await client.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        plan TEXT NOT NULL DEFAULT 'free',
        status TEXT NOT NULL DEFAULT 'trialing',
        ls_customer_id TEXT,
        ls_subscription_id TEXT,
        ls_variant_id TEXT,
        trial_ends_at DOUBLE PRECISION,
        current_period_start DOUBLE PRECISION,
        current_period_end DOUBLE PRECISION,
        cancel_at DOUBLE PRECISION,
        cancelled_at DOUBLE PRECISION,
        paused_at DOUBLE PRECISION,
        created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        updated_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS auth_tokens (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL,
        code TEXT NOT NULL,
        purpose TEXT NOT NULL,
        expires_at DOUBLE PRECISION NOT NULL,
        used_at DOUBLE PRECISION,
        created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS billing_events (
        id SERIAL PRIMARY KEY,
        username TEXT,
        event_type TEXT NOT NULL,
        ls_event_id TEXT,
        payload JSONB DEFAULT '{}'::jsonb,
        created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);

    // ── Collaboration ─────────────────────────────────────────────────────────

    await client.query(`
      CREATE TABLE IF NOT EXISTS project_collaborators (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        username TEXT,
        email TEXT NOT NULL,
        role TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        invite_token TEXT,
        invited_by TEXT NOT NULL,
        invited_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        accepted_at DOUBLE PRECISION,
        revoked_at DOUBLE PRECISION,
        revoked_by TEXT,
        last_drip_at DOUBLE PRECISION,
        drip_count INTEGER DEFAULT 0,
        created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        updated_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS collaboration_events (
        id SERIAL PRIMARY KEY,
        project_id TEXT NOT NULL,
        collaborator_id TEXT NOT NULL,
        actor_username TEXT NOT NULL,
        event_type TEXT NOT NULL,
        previous_role TEXT,
        new_role TEXT,
        detail TEXT,
        created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);

    // ── CRM ───────────────────────────────────────────────────────────────────

    await client.query(`
      CREATE TABLE IF NOT EXISTS companies (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        industry TEXT,
        website TEXT,
        notes TEXT,
        created_by TEXT,
        created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        updated_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS contacts (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        first_name TEXT,
        last_name TEXT,
        company_id TEXT,
        job_title TEXT,
        notes TEXT,
        created_by TEXT,
        created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        updated_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS contact_emails (
        id SERIAL PRIMARY KEY,
        contact_id TEXT NOT NULL,
        value TEXT NOT NULL,
        label TEXT DEFAULT 'work',
        is_primary INTEGER DEFAULT 0
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS contact_phones (
        id SERIAL PRIMARY KEY,
        contact_id TEXT NOT NULL,
        value TEXT NOT NULL,
        country_code TEXT,
        label TEXT DEFAULT 'mobile',
        is_primary INTEGER DEFAULT 0
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS contact_social (
        id SERIAL PRIMARY KEY,
        contact_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        handle TEXT NOT NULL
      )
    `);

    // ── Conversations + Messages ──────────────────────────────────────────────

    await client.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        scope_type TEXT NOT NULL,
        scope_id TEXT,
        title TEXT,
        channel_type TEXT DEFAULT 'internal',
        external_id TEXT,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        updated_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        parent_message_id INTEGER,
        sender_type TEXT NOT NULL,
        sender_id TEXT,
        sender_name TEXT,
        content TEXT NOT NULL,
        channel_type TEXT DEFAULT 'internal',
        channel_metadata JSONB DEFAULT '{}'::jsonb,
        created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        search_vector tsvector
      )
    `);

    // ── Files ─────────────────────────────────────────────────────────────────

    await client.query(`
      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        disk_path TEXT NOT NULL,
        mime_type TEXT,
        size_bytes INTEGER,
        uploaded_by TEXT NOT NULL,
        created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS file_projects (
        id SERIAL PRIMARY KEY,
        file_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        attached_by TEXT NOT NULL,
        attached_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS file_contacts (
        id SERIAL PRIMARY KEY,
        file_id TEXT NOT NULL,
        contact_id TEXT NOT NULL,
        attached_by TEXT NOT NULL,
        attached_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS file_conversations (
        id SERIAL PRIMARY KEY,
        file_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        attached_by TEXT NOT NULL,
        attached_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);

    // ── Contact junction tables ───────────────────────────────────────────────

    await client.query(`
      CREATE TABLE IF NOT EXISTS contact_conversations (
        id SERIAL PRIMARY KEY,
        contact_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS contact_projects (
        id SERIAL PRIMARY KEY,
        contact_id TEXT NOT NULL,
        project_id TEXT NOT NULL
      )
    `);

    // ── CRM Intelligence + Agent Templates ────────────────────────────────────

    await client.query(`
      CREATE TABLE IF NOT EXISTS contact_analyses (
        id TEXT PRIMARY KEY,
        contact_id TEXT NOT NULL,
        sentiment TEXT NOT NULL,
        engagement_score INTEGER NOT NULL,
        churn_risk TEXT NOT NULL,
        relationship_stage TEXT NOT NULL,
        key_topics JSONB DEFAULT '[]'::jsonb,
        last_interaction_summary TEXT,
        communication_style TEXT,
        raw_json JSONB,
        job_id TEXT,
        created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT,
        tags JSONB DEFAULT '[]'::jsonb,
        skills JSONB DEFAULT '[]'::jsonb,
        tools JSONB DEFAULT '[]'::jsonb,
        required_backends JSONB DEFAULT '[]'::jsonb,
        required_tools JSONB DEFAULT '[]'::jsonb,
        system_prompt TEXT NOT NULL DEFAULT '',
        soul_text TEXT NOT NULL DEFAULT '',
        role_card_text TEXT NOT NULL DEFAULT '',
        identity_text TEXT NOT NULL DEFAULT '',
        skills_text TEXT NOT NULL DEFAULT '',
        is_internal INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER DEFAULT 50,
        created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);

    // ── Memory V2: Concepts + Learning ────────────────────────────────────────

    await client.query(`
      CREATE TABLE IF NOT EXISTS concepts (
        id TEXT PRIMARY KEY,
        memory_kind TEXT NOT NULL DEFAULT 'concept',
        trust_tier TEXT NOT NULL DEFAULT 'low',
        scope TEXT NOT NULL DEFAULT 'global',
        scope_id TEXT,
        content TEXT NOT NULL,
        source_type TEXT NOT NULL DEFAULT 'learning',
        source_url TEXT,
        confidence_score INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active',
        review_state TEXT NOT NULL DEFAULT 'accepted',
        superseded_by_id TEXT,
        last_used_at DOUBLE PRECISION,
        use_count INTEGER NOT NULL DEFAULT 0,
        session_id TEXT,
        created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        updated_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        search_vector tsvector
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS learning_sessions (
        id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL,
        job_id TEXT,
        sources_visited JSONB DEFAULT '[]'::jsonb,
        concepts_retained INTEGER NOT NULL DEFAULT 0,
        confidence_distribution JSONB DEFAULT '{"high":0,"medium":0,"low":0}'::jsonb,
        capped INTEGER NOT NULL DEFAULT 0,
        duration_ms INTEGER,
        error TEXT,
        created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);

    // ── Admin: Customer Intelligence ──────────────────────────────────────────

    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_events (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL,
        event_type TEXT NOT NULL,
        event_data JSONB DEFAULT '{}'::jsonb,
        ip_address TEXT,
        country TEXT,
        created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_scores (
        username TEXT PRIMARY KEY,
        health INTEGER DEFAULT 50,
        conversion_score INTEGER DEFAULT 0,
        churn_risk INTEGER DEFAULT 50,
        viral_score INTEGER DEFAULT 0,
        ltv_predicted DOUBLE PRECISION DEFAULT 0,
        next_action TEXT DEFAULT '',
        computed_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_agent_tasks (
        id SERIAL PRIMARY KEY,
        agent_type TEXT NOT NULL,
        action_type TEXT NOT NULL,
        target_username TEXT,
        status TEXT DEFAULT 'queued',
        priority INTEGER DEFAULT 50,
        payload JSONB DEFAULT '{}'::jsonb,
        result TEXT,
        created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        started_at DOUBLE PRECISION,
        completed_at DOUBLE PRECISION
      )
    `);

    // ── Admin: Error Tracking ─────────────────────────────────────────────────

    await client.query(`
      CREATE TABLE IF NOT EXISTS error_log (
        id SERIAL PRIMARY KEY,
        source TEXT NOT NULL,
        severity TEXT DEFAULT 'error',
        message TEXT NOT NULL,
        stack TEXT,
        url TEXT,
        username TEXT,
        user_agent TEXT,
        ip_address TEXT,
        metadata JSONB DEFAULT '{}'::jsonb,
        resolved INTEGER DEFAULT 0,
        resolved_by TEXT,
        resolved_at DOUBLE PRECISION,
        created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);

    // ── Admin: Email System ───────────────────────────────────────────────────

    await client.query(`
      CREATE TABLE IF NOT EXISTS email_messages (
        id SERIAL PRIMARY KEY,
        folder TEXT NOT NULL DEFAULT 'drafts',
        from_email TEXT NOT NULL DEFAULT '',
        from_name TEXT NOT NULL DEFAULT '',
        to_email TEXT NOT NULL DEFAULT '',
        to_name TEXT NOT NULL DEFAULT '',
        cc TEXT NOT NULL DEFAULT '',
        bcc TEXT NOT NULL DEFAULT '',
        subject TEXT NOT NULL DEFAULT '',
        body TEXT NOT NULL DEFAULT '',
        body_html TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'draft',
        sent_at DOUBLE PRECISION,
        read_at DOUBLE PRECISION,
        error TEXT,
        in_reply_to INTEGER,
        thread_id TEXT,
        created_at DOUBLE PRECISION NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
        updated_at DOUBLE PRECISION NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);

    // ── Admin: Workspace Settings ─────────────────────────────────────────────

    await client.query(`
      CREATE TABLE IF NOT EXISTS workspace_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    // ── Admin: Forge Pipeline ─────────────────────────────────────────────────

    await client.query(`
      CREATE TABLE IF NOT EXISTS forge_pipeline (
        id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL,
        agent_id TEXT,
        station INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'queued',
        flags JSONB DEFAULT '[]'::jsonb,
        instance_learnings JSONB DEFAULT '{}'::jsonb,
        wave INTEGER NOT NULL DEFAULT 0,
        tokens_used INTEGER DEFAULT 0,
        worker_id TEXT,
        lease_expires_at DOUBLE PRECISION,
        attempt_count INTEGER DEFAULT 0,
        max_attempts INTEGER DEFAULT 3,
        started_at DOUBLE PRECISION,
        completed_at DOUBLE PRECISION,
        error TEXT,
        cycle INTEGER NOT NULL DEFAULT 1,
        created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        updated_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS forge_station_runs (
        id TEXT PRIMARY KEY,
        pipeline_id TEXT NOT NULL REFERENCES forge_pipeline(id),
        station INTEGER NOT NULL,
        phase TEXT NOT NULL,
        run_sequence INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'running',
        writer_model TEXT,
        checker_model TEXT,
        quality_score INTEGER,
        rubric JSONB DEFAULT '{}'::jsonb,
        qa_rationale TEXT,
        files_touched JSONB DEFAULT '[]'::jsonb,
        skills_assigned JSONB DEFAULT '[]'::jsonb,
        tools_mapped JSONB DEFAULT '[]'::jsonb,
        flags JSONB DEFAULT '[]'::jsonb,
        tokens_used INTEGER DEFAULT 0,
        cost_reserved DOUBLE PRECISION DEFAULT 0,
        cost_actual DOUBLE PRECISION DEFAULT 0,
        prompt_version TEXT,
        duration_ms INTEGER,
        started_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        completed_at DOUBLE PRECISION
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS forge_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    // ── Admin: Audit Log ──────────────────────────────────────────────────────

    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id SERIAL PRIMARY KEY,
        ts DOUBLE PRECISION NOT NULL,
        ts_iso TEXT NOT NULL,
        actor TEXT NOT NULL,
        actor_type TEXT DEFAULT 'session',
        action TEXT NOT NULL,
        target TEXT,
        details JSONB DEFAULT '{}'::jsonb,
        project_id TEXT,
        session_id TEXT,
        ip_address TEXT
      )
    `);

    // ── Admin: Invites ────────────────────────────────────────────────────────

    await client.query(`
      CREATE TABLE IF NOT EXISTS invites (
        code TEXT PRIMARY KEY,
        role TEXT DEFAULT 'operator',
        created_by TEXT NOT NULL,
        created_at DOUBLE PRECISION NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
        expires_at DOUBLE PRECISION,
        max_uses INTEGER DEFAULT 1,
        use_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'active'
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS invite_uses (
        id SERIAL PRIMARY KEY,
        invite_code TEXT NOT NULL,
        username TEXT NOT NULL,
        used_at DOUBLE PRECISION NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);

    // ── Agent Messages (legacy) ───────────────────────────────────────────────

    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_messages (
        id SERIAL PRIMARY KEY,
        run_id TEXT NOT NULL,
        from_agent TEXT NOT NULL DEFAULT 'porter',
        to_agent TEXT NOT NULL,
        message TEXT NOT NULL,
        response TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        model TEXT,
        tokens_total INTEGER DEFAULT 0,
        duration_ms INTEGER DEFAULT 0,
        error TEXT,
        created_at DOUBLE PRECISION NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
        completed_at DOUBLE PRECISION,
        chain_id TEXT,
        step_num INTEGER DEFAULT 0,
        injected_memories JSONB DEFAULT '[]'::jsonb
      )
    `);

    // ── Persona Skills ────────────────────────────────────────────────────────

    await client.query(`
      CREATE TABLE IF NOT EXISTS persona_skills (
        persona_id TEXT NOT NULL,
        skill_name TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        assigned_at DOUBLE PRECISION NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
        PRIMARY KEY (persona_id, skill_name)
      )
    `);

    // ── Indexes ───────────────────────────────────────────────────────────────

    await client.query(`CREATE INDEX IF NOT EXISTS idx_jobs_status ON agent_jobs(status, scheduled_for)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_activity_agent ON agent_activity(agent_id, created_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_msg_parent ON messages(parent_message_id) WHERE parent_message_id IS NOT NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ce_username ON customer_events(username)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ce_type ON customer_events(event_type)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ce_created ON customer_events(created_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_aat_status ON admin_agent_tasks(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_aat_agent ON admin_agent_tasks(agent_type)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_el_source ON error_log(source)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_el_resolved ON error_log(resolved)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_el_created ON error_log(created_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_email_folder ON email_messages(folder)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_email_status ON email_messages(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_email_thread ON email_messages(thread_id)`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_forge_unique ON forge_pipeline(template_id, cycle)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_forge_station ON forge_pipeline(station, status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_fsr_pipeline ON forge_station_runs(pipeline_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_agent_msg_run ON agent_messages(run_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_agent_msg_status ON agent_messages(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_agent_msg_chain ON agent_messages(chain_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_agent_msg_created ON agent_messages(created_at DESC)`);

    // ── Full-text search triggers + GIN indexes ──────────────────────────────

    await client.query(`
      CREATE OR REPLACE FUNCTION messages_search_update() RETURNS trigger AS $$
      BEGIN
        NEW.search_vector :=
          setweight(to_tsvector('english', COALESCE(NEW.content, '')), 'A') ||
          setweight(to_tsvector('english', COALESCE(NEW.sender_name, '')), 'B') ||
          setweight(to_tsvector('english', COALESCE(NEW.channel_type, '')), 'C');
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    await client.query(`
      CREATE TRIGGER messages_search_trig
        BEFORE INSERT OR UPDATE ON messages
        FOR EACH ROW EXECUTE FUNCTION messages_search_update()
    `);

    await client.query(`
      CREATE OR REPLACE FUNCTION concepts_search_update() RETURNS trigger AS $$
      BEGIN
        NEW.search_vector := to_tsvector('english', COALESCE(NEW.content, ''));
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    await client.query(`
      CREATE TRIGGER concepts_search_trig
        BEFORE INSERT OR UPDATE ON concepts
        FOR EACH ROW EXECUTE FUNCTION concepts_search_update()
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_messages_fts ON messages USING GIN(search_vector)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_concepts_fts ON concepts USING GIN(search_vector)`);

    // ── Seed data ─────────────────────────────────────────────────────────────

    await client.query(`INSERT INTO forge_settings (key, value) VALUES ('tick_interval_ms', '30000') ON CONFLICT DO NOTHING`);
    await client.query(`INSERT INTO forge_settings (key, value) VALUES ('daily_token_budget', '500000') ON CONFLICT DO NOTHING`);
    await client.query(`INSERT INTO forge_settings (key, value) VALUES ('quality_threshold', '60') ON CONFLICT DO NOTHING`);
    await client.query(`INSERT INTO forge_settings (key, value) VALUES ('current_wave', '0') ON CONFLICT DO NOTHING`);
    await client.query(`INSERT INTO forge_settings (key, value) VALUES ('running', 'false') ON CONFLICT DO NOTHING`);

    // ── Mark migration complete ───────────────────────────────────────────────

    await client.query(
      `INSERT INTO schema_migrations (id) VALUES ('consolidated_pg_v1')`
    );

    await client.query('COMMIT');
    console.log('[migrate] consolidated_pg_v1 applied — 52 tables created');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
