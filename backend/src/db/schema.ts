import { sqliteTable, text, integer, real, blob } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  username: text('username').primaryKey(),
  displayName: text('display_name'),
  fullName: text('full_name'),
  email: text('email'),
  passwordHash: text('password_hash').notNull(),
  salt: text('salt').notNull(),
  role: text('role').default('operator'),
  emailVerified: integer('email_verified').default(0),
  status: text('status').default('active'),
  createdAt: real('created_at').default(sql`(strftime('%s','now'))`),
});

export const sessions = sqliteTable('sessions', {
  token: text('token').primaryKey(),
  username: text('username').notNull(),
  expires: real('expires').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  lastSeenAt: real('last_seen_at').default(sql`(strftime('%s','now'))`),
  createdAt: real('created_at').default(sql`(strftime('%s','now'))`),
});

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  projectId: text('project_id'),
  username: text('username'),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').default('pending').notNull(),
  priority: text('priority').default('normal').notNull(),
  phase: text('phase'),
  createdAt: real('created_at').default(sql`(strftime('%s','now'))`),
  updatedAt: real('updated_at'),
  completedAt: real('completed_at'),
  assignedAgentId: text('assigned_agent_id'),
  tokensUsed: integer('tokens_used').default(0),
  timeMinutes: integer('time_minutes').default(0),
  result: text('result'),
  tags: text('tags'), // JSON string
  sortOrder: integer('sort_order').default(0),
});

export const chats = sqliteTable('chats', {
  id: text('id').primaryKey(),
  title: text('title'),
  projectId: text('project_id'),
  username: text('username'),
  modelId: text('model_id'),
  metadata: text('metadata'), // JSON string
  createdAt: real('created_at').default(sql`(strftime('%s','now'))`),
  updatedAt: real('updated_at').default(sql`(strftime('%s','now'))`),
});

export const chatMessages = sqliteTable('chat_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  chatId: text('chat_id').notNull().references(() => chats.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  content: text('content').notNull(),
  timestamp: real('timestamp').default(sql`(strftime('%s','now'))`),
  modelId: text('model_id'),
});

export const chatAttachments = sqliteTable('chat_attachments', {
  id: text('id').primaryKey(),
  messageId: integer('message_id').references(() => chatMessages.id, { onDelete: 'cascade' }),
  chatId: text('chat_id').notNull().references(() => chats.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),
  contentType: text('content_type'),
  size: integer('size'),
  data: blob('data'),
  createdAt: real('created_at').default(sql`(strftime('%s','now'))`),
});

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug'),
  type: text('type').default('custom'),
  status: text('status').default('active'),
  description: text('description'),
  ownerId: text('owner_id').notNull(),
  milestones: text('milestones'),    // JSON array
  artifacts: text('artifacts'),       // JSON array
  links: text('links'),               // JSON array
  metadata: text('metadata'),         // JSON blob for extensibility
  createdAt: real('created_at').default(sql`(strftime('%s','now'))`),
  updatedAt: real('updated_at').default(sql`(strftime('%s','now'))`),
  deadline: text('deadline'),         // ISO date string YYYY-MM-DD
});

export const personas = sqliteTable('personas', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  role: text('role').default(''),
  avatar: text('avatar').default(''),
  preferredBackend: text('preferred_backend'),
  fallbackBackends: text('fallback_backends').default('[]'),
  status: text('status').default('idle'),
  soulHash: text('soul_hash').default(''),
  agentGroup: text('agent_group').default(''),
  createdAt: text('created_at').notNull(),
  lastActive: text('last_active'),
  config: text('config').default('{}'),
  sortOrder: integer('sort_order').default(50),
  owner: text('owner').default(''),
  isSystem: integer('is_system').default(0),
  isPublic: integer('is_public').default(1),
  isLocked: integer('is_locked').default(0),
  isMaster: integer('is_master').default(0),
  orchestratorOnly: integer('orchestrator_only').default(0),
  isTemporary: integer('is_temporary').default(0),
  managedByPorter: integer('managed_by_porter').default(0),
  appearanceStyle: text('appearance_style').default(''),
  appearanceSpec: text('appearance_spec').default('{}'),
  skinAssetPath: text('skin_asset_path').default(''),
  portraitAssetPath: text('portrait_asset_path').default(''),
  heartbeatEnabled: integer('heartbeat_enabled').default(0),
  heartbeatCron: text('heartbeat_cron').default(''),
  lastHeartbeat: text('last_heartbeat'),
  templateId: text('template_id'),
});

export const schemaMigrations = sqliteTable('schema_migrations', {
  id: text('id').primaryKey(),
  appliedAt: real('applied_at').default(sql`(strftime('%s','now'))`),
});

export const agentJobs = sqliteTable('agent_jobs', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull(),
  projectId: text('project_id'),
  parentAgentId: text('parent_agent_id'),
  triggerType: text('trigger_type').notNull().default('scheduled'),
  triggerData: text('trigger_data').default('{}'),
  prompt: text('prompt'),
  status: text('status').notNull().default('pending'),
  scheduledFor: real('scheduled_for').notNull(),
  startedAt: real('started_at'),
  completedAt: real('completed_at'),
  workerId: text('worker_id'),
  attemptCount: integer('attempt_count').default(0),
  result: text('result'),
  error: text('error'),
  createdAt: real('created_at').default(sql`(unixepoch('now'))`),
});

export const agentActivity = sqliteTable('agent_activity', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  agentId: text('agent_id').notNull(),
  jobId: text('job_id'),
  projectId: text('project_id'),
  eventType: text('event_type').notNull(),
  summary: text('summary'),
  detail: text('detail'),
  createdAt: real('created_at').default(sql`(unixepoch('now'))`),
});

export const decisionLog = sqliteTable('decision_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  decisionType: text('decision_type').notNull(), // 'model_selection' | 'agent_routing' | 'task_skip'
  chosen: text('chosen').notNull(),              // e.g. "Claude Opus" or "Writer Agent"
  reasoning: text('reasoning').notNull(),        // Plain English sentence
  alternatives: text('alternatives').default('[]'), // JSON array of considered options
  projectId: text('project_id'),
  agentId: text('agent_id'),
  jobId: text('job_id'),
  createdAt: real('created_at').default(sql`(unixepoch('now'))`),
});

export const tokenUsageDaily = sqliteTable('token_usage_daily', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  model: text('model').notNull(),           // e.g. "openai-codex/gpt-5.4" or "qwen2.5-coder:1.5b"
  date: text('date').notNull(),             // ISO date YYYY-MM-DD
  inputTokens: integer('input_tokens').default(0),
  outputTokens: integer('output_tokens').default(0),
  requestCount: integer('request_count').default(0),
  createdAt: real('created_at').default(sql`(unixepoch('now'))`),
});

// ── External Connections ─────────────────────────────────────────────────────

export const workspaceConnections = sqliteTable('workspace_connections', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(),
  kind: text('kind').notNull().default('api_key'),
  status: text('status').notNull().default('disconnected'),
  displayName: text('display_name').default(''),
  scopesJson: text('scopes_json').default('[]'),
  toolsJson: text('tools_json').default('[]'),
  lastSyncAt: real('last_sync_at').default(0),
  lastError: text('last_error').default(''),
  installedBy: text('installed_by').default(''),
  metaJson: text('meta_json').default('{}'),
  metaEncrypted: integer('meta_encrypted').default(0),
  createdAt: real('created_at').default(sql`(strftime('%s','now'))`),
  updatedAt: real('updated_at').default(sql`(strftime('%s','now'))`),
});

export const projectConnections = sqliteTable('project_connections', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: text('project_id').notNull(),
  connectionId: text('connection_id').notNull(),
  accessMode: text('access_mode').notNull().default('read'),
  enabledToolsJson: text('enabled_tools_json').default('[]'),
  status: text('status').notNull().default('active'),
  attachedBy: text('attached_by').default(''),
  attachedAt: real('attached_at').default(sql`(strftime('%s','now'))`),
});

export const calendarEvents = sqliteTable('calendar_events', {
  id: text('id').primaryKey(),
  connectionId: text('connection_id').notNull(),
  projectId: text('project_id'),
  googleEventId: text('google_event_id').notNull(),
  title: text('title').notNull(),
  startAt: text('start_at').notNull(),
  endAt: text('end_at'),
  allDay: integer('all_day').default(0),
  syncedAt: real('synced_at').default(sql`(unixepoch('now'))`),
});

// ── Billing ──────────────────────────────────────────────────────────────────

export const subscriptions = sqliteTable('subscriptions', {
  id: text('id').primaryKey(),
  username: text('username').notNull(),
  plan: text('plan').notNull().default('free'),                     // free | cloud | cloud_team | enterprise
  status: text('status').notNull().default('trialing'),             // trialing | active | past_due | paused | cancelled | expired
  lsCustomerId: text('ls_customer_id'),                             // Lemon Squeezy customer ID
  lsSubscriptionId: text('ls_subscription_id'),                     // Lemon Squeezy subscription ID
  lsVariantId: text('ls_variant_id'),                               // Lemon Squeezy variant ID
  trialEndsAt: real('trial_ends_at'),                               // unix epoch
  currentPeriodStart: real('current_period_start'),
  currentPeriodEnd: real('current_period_end'),
  cancelAt: real('cancel_at'),                                      // scheduled cancellation
  cancelledAt: real('cancelled_at'),                                // actual cancellation
  pausedAt: real('paused_at'),
  createdAt: real('created_at').default(sql`(unixepoch('now'))`),
  updatedAt: real('updated_at').default(sql`(unixepoch('now'))`),
});

export const authTokens = sqliteTable('auth_tokens', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull(),
  code: text('code').notNull(),
  purpose: text('purpose').notNull(),       // 'verify_email' | 'reset_password'
  expiresAt: real('expires_at').notNull(),
  usedAt: real('used_at'),
  createdAt: real('created_at').default(sql`(unixepoch('now'))`),
});

export const billingEvents = sqliteTable('billing_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username'),
  eventType: text('event_type').notNull(),                          // subscription_created | subscription_updated | payment_success | payment_failed | trial_started | trial_expired
  lsEventId: text('ls_event_id'),                                  // Lemon Squeezy webhook event ID (dedup)
  payload: text('payload').default('{}'),                           // raw webhook JSON
  createdAt: real('created_at').default(sql`(unixepoch('now'))`),
});

// -- Collaboration (Phase 10) --

export const projectCollaborators = sqliteTable('project_collaborators', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  username: text('username'),
  email: text('email').notNull(),
  role: text('role').notNull(),
  status: text('status').notNull().default('pending'),
  inviteToken: text('invite_token'),
  invitedBy: text('invited_by').notNull(),
  invitedAt: real('invited_at').default(sql`(unixepoch('now'))`),
  acceptedAt: real('accepted_at'),
  revokedAt: real('revoked_at'),
  revokedBy: text('revoked_by'),
  lastDripAt: real('last_drip_at'),
  dripCount: integer('drip_count').default(0),
  createdAt: real('created_at').default(sql`(unixepoch('now'))`),
  updatedAt: real('updated_at').default(sql`(unixepoch('now'))`),
});

export const collaborationEvents = sqliteTable('collaboration_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: text('project_id').notNull(),
  collaboratorId: text('collaborator_id').notNull(),
  actorUsername: text('actor_username').notNull(),
  eventType: text('event_type').notNull(),
  previousRole: text('previous_role'),
  newRole: text('new_role'),
  detail: text('detail'),
  createdAt: real('created_at').default(sql`(unixepoch('now'))`),
});

// -- Unified Chat + CRM + Files (Phase 11) -----------------------------------------

export const companies = sqliteTable('companies', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  industry: text('industry'),
  website: text('website'),
  notes: text('notes'),
  createdBy: text('created_by'),
  createdAt: real('created_at').default(sql`(unixepoch('now'))`),
  updatedAt: real('updated_at').default(sql`(unixepoch('now'))`),
});

export const contacts = sqliteTable('contacts', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  firstName: text('first_name'),
  lastName: text('last_name'),
  companyId: text('company_id'),
  jobTitle: text('job_title'),
  notes: text('notes'),
  createdBy: text('created_by'),
  createdAt: real('created_at').default(sql`(unixepoch('now'))`),
  updatedAt: real('updated_at').default(sql`(unixepoch('now'))`),
});

export const contactEmails = sqliteTable('contact_emails', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  contactId: text('contact_id').notNull(),
  value: text('value').notNull(),
  label: text('label').default('work'),
  isPrimary: integer('is_primary').default(0),
});

export const contactPhones = sqliteTable('contact_phones', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  contactId: text('contact_id').notNull(),
  value: text('value').notNull(),
  countryCode: text('country_code'),
  label: text('label').default('mobile'),
  isPrimary: integer('is_primary').default(0),
});

export const contactSocial = sqliteTable('contact_social', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  contactId: text('contact_id').notNull(),
  platform: text('platform').notNull(),
  handle: text('handle').notNull(),
});

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  scopeType: text('scope_type').notNull(),
  scopeId: text('scope_id'),
  title: text('title'),
  channelType: text('channel_type').default('internal'),
  externalId: text('external_id'),
  metadata: text('metadata').default('{}'),
  createdAt: real('created_at').default(sql`(unixepoch('now'))`),
  updatedAt: real('updated_at').default(sql`(unixepoch('now'))`),
});

export const messages = sqliteTable('messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  conversationId: text('conversation_id').notNull(),
  parentMessageId: integer('parent_message_id'),
  senderType: text('sender_type').notNull(),
  senderId: text('sender_id'),
  senderName: text('sender_name'),
  content: text('content').notNull(),
  channelType: text('channel_type').default('internal'),
  channelMetadata: text('channel_metadata').default('{}'),
  createdAt: real('created_at').default(sql`(unixepoch('now'))`),
});

export const filesRegistry = sqliteTable('files', {
  id: text('id').primaryKey(),
  filename: text('filename').notNull(),
  diskPath: text('disk_path').notNull(),
  mimeType: text('mime_type'),
  sizeBytes: integer('size_bytes'),
  uploadedBy: text('uploaded_by').notNull(),
  createdAt: real('created_at').default(sql`(unixepoch('now'))`),
});

export const fileProjects = sqliteTable('file_projects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  fileId: text('file_id').notNull(),
  projectId: text('project_id').notNull(),
  attachedBy: text('attached_by').notNull(),
  attachedAt: real('attached_at').default(sql`(unixepoch('now'))`),
});

export const fileContacts = sqliteTable('file_contacts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  fileId: text('file_id').notNull(),
  contactId: text('contact_id').notNull(),
  attachedBy: text('attached_by').notNull(),
  attachedAt: real('attached_at').default(sql`(unixepoch('now'))`),
});

export const fileConversations = sqliteTable('file_conversations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  fileId: text('file_id').notNull(),
  conversationId: text('conversation_id').notNull(),
  attachedBy: text('attached_by').notNull(),
  attachedAt: real('attached_at').default(sql`(unixepoch('now'))`),
});

export const contactConversations = sqliteTable('contact_conversations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  contactId: text('contact_id').notNull(),
  conversationId: text('conversation_id').notNull(),
});

export const contactProjects = sqliteTable('contact_projects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  contactId: text('contact_id').notNull(),
  projectId: text('project_id').notNull(),
});

// -- CRM Intelligence + Agent Templates (Phase 12) ------------------------------------

export const contactAnalyses = sqliteTable('contact_analyses', {
  id: text('id').primaryKey(),
  contactId: text('contact_id').notNull(),
  sentiment: text('sentiment').notNull(),
  engagementScore: integer('engagement_score').notNull(),
  churnRisk: text('churn_risk').notNull(),
  relationshipStage: text('relationship_stage').notNull(),
  keyTopics: text('key_topics').notNull().default('[]'),
  lastInteractionSummary: text('last_interaction_summary'),
  communicationStyle: text('communication_style'),
  rawJson: text('raw_json'),
  jobId: text('job_id'),
  createdAt: real('created_at').default(sql`(unixepoch('now'))`),
});

export const agentTemplates = sqliteTable('agent_templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  description: text('description'),
  tags: text('tags').notNull().default('[]'),
  skills: text('skills').notNull().default('[]'),
  tools: text('tools').notNull().default('[]'),
  requiredBackends: text('required_backends').notNull().default('[]'),
  requiredTools: text('required_tools').notNull().default('[]'),
  systemPrompt: text('system_prompt').notNull().default(''),
  soulText: text('soul_text').notNull().default(''),
  roleCardText: text('role_card_text').notNull().default(''),
  identityText: text('identity_text').notNull().default(''),
  skillsText: text('skills_text').notNull().default(''),
  isInternal: integer('is_internal').notNull().default(0),
  sortOrder: integer('sort_order').default(50),
  createdAt: real('created_at').default(sql`(unixepoch('now'))`),
});
