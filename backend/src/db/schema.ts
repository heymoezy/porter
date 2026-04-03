import { pgTable, text, integer, doublePrecision, serial, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { customType } from 'drizzle-orm/pg-core';

const tsvector = customType<{ data: string }>({
  dataType() { return 'tsvector'; },
});

// ── Users & Sessions ──────────────────────────────────────────────────────────

export const users = pgTable('users', {
  username: text('username').primaryKey(),
  displayName: text('display_name'),
  fullName: text('full_name'),
  email: text('email'),
  passwordHash: text('password_hash').notNull(),
  salt: text('salt').notNull(),
  role: text('role').default('operator'),
  emailVerified: integer('email_verified').default(0),
  status: text('status').default('active'),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
  // Admin CRM fields
  country: text('country'),
  city: text('city'),
  timezone: text('timezone'),
  company: text('company'),
  jobTitle: text('job_title'),
  phone: text('phone'),
  bio: text('bio'),
  socialX: text('social_x'),
  socialLinkedin: text('social_linkedin'),
  socialGithub: text('social_github'),
  avatarUrl: text('avatar_url'),
  language: text('language').default('en'),
  suspendedAt: doublePrecision('suspended_at'),
  suspensionReason: text('suspension_reason'),
  termsAcceptedAt: doublePrecision('terms_accepted_at'),
  lastIp: text('last_ip'),
  signupSource: text('signup_source'),
  lifetimeFree: integer('lifetime_free').default(0),
});

export const sessions = pgTable('sessions', {
  token: text('token').primaryKey(),
  username: text('username').notNull(),
  expires: doublePrecision('expires').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  lastSeenAt: doublePrecision('last_seen_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
});

// ── Tasks ─────────────────────────────────────────────────────────────────────

export const tasks = pgTable('tasks', {
  id: text('id').primaryKey(),
  projectId: text('project_id'),
  username: text('username'),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').default('pending').notNull(),
  priority: text('priority').default('normal').notNull(),
  phase: text('phase'),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
  updatedAt: doublePrecision('updated_at'),
  completedAt: doublePrecision('completed_at'),
  assignedAgentId: text('assigned_agent_id'),
  tokensUsed: integer('tokens_used').default(0),
  timeMinutes: integer('time_minutes').default(0),
  result: text('result'),
  tags: jsonb('tags').default(sql`'[]'::jsonb`),
  sortOrder: integer('sort_order').default(0),
});

// ── Chats ─────────────────────────────────────────────────────────────────────

export const chats = pgTable('chats', {
  id: text('id').primaryKey(),
  title: text('title'),
  projectId: text('project_id'),
  username: text('username'),
  modelId: text('model_id'),
  metadata: jsonb('metadata').default(sql`'{}'::jsonb`),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
  updatedAt: doublePrecision('updated_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
});

export const chatMessages = pgTable('chat_messages', {
  id: serial('id').primaryKey(),
  chatId: text('chat_id').notNull().references(() => chats.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  content: text('content').notNull(),
  timestamp: doublePrecision('timestamp').default(sql`EXTRACT(EPOCH FROM NOW())`),
  modelId: text('model_id'),
});

export const chatAttachments = pgTable('chat_attachments', {
  id: text('id').primaryKey(),
  messageId: integer('message_id').references(() => chatMessages.id, { onDelete: 'cascade' }),
  chatId: text('chat_id').notNull().references(() => chats.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),
  contentType: text('content_type'),
  size: integer('size'),
  data: text('data'),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
});

// ── Projects ──────────────────────────────────────────────────────────────────

export const projects = pgTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug'),
  type: text('type').default('custom'),
  status: text('status').default('active'),
  description: text('description'),
  ownerId: text('owner_id').notNull(),
  milestones: jsonb('milestones').default(sql`'[]'::jsonb`),
  artifacts: jsonb('artifacts').default(sql`'[]'::jsonb`),
  links: jsonb('links').default(sql`'[]'::jsonb`),
  metadata: jsonb('metadata').default(sql`'{}'::jsonb`),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
  updatedAt: doublePrecision('updated_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
  deadline: text('deadline'),         // ISO date string YYYY-MM-DD
});

// ── Personas (Agents) ─────────────────────────────────────────────────────────

export const personas = pgTable('personas', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  role: text('role').default(''),
  avatar: text('avatar').default(''),
  preferredBackend: text('preferred_backend'),
  fallbackBackends: jsonb('fallback_backends').default(sql`'[]'::jsonb`),
  status: text('status').default('idle'),
  soulHash: text('soul_hash').default(''),
  agentGroup: text('agent_group').default(''),
  createdAt: text('created_at').notNull(),          // ISO string, NOT epoch
  lastActive: text('last_active'),                  // ISO string, NOT epoch
  config: jsonb('config').default(sql`'{}'::jsonb`),
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
  appearanceSpec: jsonb('appearance_spec').default(sql`'{}'::jsonb`),
  skinAssetPath: text('skin_asset_path').default(''),
  portraitAssetPath: text('portrait_asset_path').default(''),
  heartbeatEnabled: integer('heartbeat_enabled').default(0),
  heartbeatCron: text('heartbeat_cron').default(''),
  lastHeartbeat: text('last_heartbeat'),            // ISO string, NOT epoch
  templateId: text('template_id'),
});

// ── Schema Migrations ─────────────────────────────────────────────────────────

export const schemaMigrations = pgTable('schema_migrations', {
  id: text('id').primaryKey(),
  appliedAt: doublePrecision('applied_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
});

// ── Agent Jobs & Activity ─────────────────────────────────────────────────────

export const agentJobs = pgTable('agent_jobs', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull(),
  projectId: text('project_id'),
  parentAgentId: text('parent_agent_id'),
  triggerType: text('trigger_type').notNull().default('scheduled'),
  triggerData: jsonb('trigger_data').default(sql`'{}'::jsonb`),
  prompt: text('prompt'),
  status: text('status').notNull().default('pending'),
  scheduledFor: doublePrecision('scheduled_for').notNull(),
  startedAt: doublePrecision('started_at'),
  completedAt: doublePrecision('completed_at'),
  workerId: text('worker_id'),
  attemptCount: integer('attempt_count').default(0),
  result: text('result'),
  error: text('error'),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
});

export const agentActivity = pgTable('agent_activity', {
  id: serial('id').primaryKey(),
  agentId: text('agent_id').notNull(),
  jobId: text('job_id'),
  projectId: text('project_id'),
  eventType: text('event_type').notNull(),
  summary: text('summary'),
  detail: text('detail'),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
});

// ── Decision Log ──────────────────────────────────────────────────────────────

export const decisionLog = pgTable('decision_log', {
  id: serial('id').primaryKey(),
  decisionType: text('decision_type').notNull(),
  chosen: text('chosen').notNull(),
  reasoning: text('reasoning').notNull(),
  alternatives: jsonb('alternatives').default(sql`'[]'::jsonb`),
  projectId: text('project_id'),
  agentId: text('agent_id'),
  jobId: text('job_id'),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
});

// ── Token Usage ───────────────────────────────────────────────────────────────

export const tokenUsageDaily = pgTable('token_usage_daily', {
  id: serial('id').primaryKey(),
  model: text('model').notNull(),
  date: text('date').notNull(),             // ISO date YYYY-MM-DD
  inputTokens: integer('input_tokens').default(0),
  outputTokens: integer('output_tokens').default(0),
  requestCount: integer('request_count').default(0),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
});

// ── External Connections ─────────────────────────────────────────────────────

export const workspaceConnections = pgTable('workspace_connections', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(),
  kind: text('kind').notNull().default('api_key'),
  status: text('status').notNull().default('disconnected'),
  displayName: text('display_name').default(''),
  scopesJson: jsonb('scopes_json').default(sql`'[]'::jsonb`),
  toolsJson: jsonb('tools_json').default(sql`'[]'::jsonb`),
  lastSyncAt: doublePrecision('last_sync_at').default(0),
  lastError: text('last_error').default(''),
  installedBy: text('installed_by').default(''),
  metaJson: jsonb('meta_json').default(sql`'{}'::jsonb`),
  metaEncrypted: integer('meta_encrypted').default(0),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
  updatedAt: doublePrecision('updated_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
});

export const projectConnections = pgTable('project_connections', {
  id: serial('id').primaryKey(),
  projectId: text('project_id').notNull(),
  connectionId: text('connection_id').notNull(),
  accessMode: text('access_mode').notNull().default('read'),
  enabledToolsJson: jsonb('enabled_tools_json').default(sql`'[]'::jsonb`),
  status: text('status').notNull().default('active'),
  attachedBy: text('attached_by').default(''),
  attachedAt: doublePrecision('attached_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
});

export const calendarEvents = pgTable('calendar_events', {
  id: text('id').primaryKey(),
  connectionId: text('connection_id').notNull(),
  projectId: text('project_id'),
  googleEventId: text('google_event_id').notNull(),
  title: text('title').notNull(),
  startAt: text('start_at').notNull(),              // ISO date string
  endAt: text('end_at'),                            // ISO date string
  allDay: integer('all_day').default(0),
  syncedAt: doublePrecision('synced_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
});

// ── Billing ──────────────────────────────────────────────────────────────────

export const subscriptions = pgTable('subscriptions', {
  id: text('id').primaryKey(),
  username: text('username').notNull(),
  plan: text('plan').notNull().default('free'),
  status: text('status').notNull().default('trialing'),
  lsCustomerId: text('ls_customer_id'),
  lsSubscriptionId: text('ls_subscription_id'),
  lsVariantId: text('ls_variant_id'),
  trialEndsAt: doublePrecision('trial_ends_at'),
  currentPeriodStart: doublePrecision('current_period_start'),
  currentPeriodEnd: doublePrecision('current_period_end'),
  cancelAt: doublePrecision('cancel_at'),
  cancelledAt: doublePrecision('cancelled_at'),
  pausedAt: doublePrecision('paused_at'),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
  updatedAt: doublePrecision('updated_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
});

export const authTokens = pgTable('auth_tokens', {
  id: serial('id').primaryKey(),
  email: text('email').notNull(),
  code: text('code').notNull(),
  purpose: text('purpose').notNull(),
  expiresAt: doublePrecision('expires_at').notNull(),
  usedAt: doublePrecision('used_at'),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
});

export const billingEvents = pgTable('billing_events', {
  id: serial('id').primaryKey(),
  username: text('username'),
  eventType: text('event_type').notNull(),
  lsEventId: text('ls_event_id'),
  payload: jsonb('payload').default(sql`'{}'::jsonb`),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
});

// ── Collaboration ─────────────────────────────────────────────────────────────

export const projectCollaborators = pgTable('project_collaborators', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  username: text('username'),
  email: text('email').notNull(),
  role: text('role').notNull(),
  status: text('status').notNull().default('pending'),
  inviteToken: text('invite_token'),
  invitedBy: text('invited_by').notNull(),
  invitedAt: doublePrecision('invited_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
  acceptedAt: doublePrecision('accepted_at'),
  revokedAt: doublePrecision('revoked_at'),
  revokedBy: text('revoked_by'),
  lastDripAt: doublePrecision('last_drip_at'),
  dripCount: integer('drip_count').default(0),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
  updatedAt: doublePrecision('updated_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
});

export const collaborationEvents = pgTable('collaboration_events', {
  id: serial('id').primaryKey(),
  projectId: text('project_id').notNull(),
  collaboratorId: text('collaborator_id').notNull(),
  actorUsername: text('actor_username').notNull(),
  eventType: text('event_type').notNull(),
  previousRole: text('previous_role'),
  newRole: text('new_role'),
  detail: text('detail'),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
});

// ── Unified Chat + CRM + Files ────────────────────────────────────────────────

export const companies = pgTable('companies', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  industry: text('industry'),
  website: text('website'),
  notes: text('notes'),
  createdBy: text('created_by'),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
  updatedAt: doublePrecision('updated_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
});

export const contacts = pgTable('contacts', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  firstName: text('first_name'),
  lastName: text('last_name'),
  companyId: text('company_id'),
  jobTitle: text('job_title'),
  notes: text('notes'),
  createdBy: text('created_by'),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
  updatedAt: doublePrecision('updated_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
});

export const contactEmails = pgTable('contact_emails', {
  id: serial('id').primaryKey(),
  contactId: text('contact_id').notNull(),
  value: text('value').notNull(),
  label: text('label').default('work'),
  isPrimary: integer('is_primary').default(0),
});

export const contactPhones = pgTable('contact_phones', {
  id: serial('id').primaryKey(),
  contactId: text('contact_id').notNull(),
  value: text('value').notNull(),
  countryCode: text('country_code'),
  label: text('label').default('mobile'),
  isPrimary: integer('is_primary').default(0),
});

export const contactSocial = pgTable('contact_social', {
  id: serial('id').primaryKey(),
  contactId: text('contact_id').notNull(),
  platform: text('platform').notNull(),
  handle: text('handle').notNull(),
});

export const conversations = pgTable('conversations', {
  id: text('id').primaryKey(),
  scopeType: text('scope_type').notNull(),
  scopeId: text('scope_id'),
  title: text('title'),
  channelType: text('channel_type').default('internal'),
  externalId: text('external_id'),
  metadata: jsonb('metadata').default(sql`'{}'::jsonb`),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
  updatedAt: doublePrecision('updated_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
});

export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  conversationId: text('conversation_id').notNull(),
  parentMessageId: integer('parent_message_id'),
  senderType: text('sender_type').notNull(),
  senderId: text('sender_id'),
  senderName: text('sender_name'),
  content: text('content').notNull(),
  channelType: text('channel_type').default('internal'),
  channelMetadata: jsonb('channel_metadata').default(sql`'{}'::jsonb`),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
  searchVector: tsvector('search_vector'),
});

export const filesRegistry = pgTable('files', {
  id: text('id').primaryKey(),
  filename: text('filename').notNull(),
  diskPath: text('disk_path').notNull(),
  mimeType: text('mime_type'),
  sizeBytes: integer('size_bytes'),
  uploadedBy: text('uploaded_by').notNull(),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
});

export const fileProjects = pgTable('file_projects', {
  id: serial('id').primaryKey(),
  fileId: text('file_id').notNull(),
  projectId: text('project_id').notNull(),
  attachedBy: text('attached_by').notNull(),
  attachedAt: doublePrecision('attached_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
});

export const fileContacts = pgTable('file_contacts', {
  id: serial('id').primaryKey(),
  fileId: text('file_id').notNull(),
  contactId: text('contact_id').notNull(),
  attachedBy: text('attached_by').notNull(),
  attachedAt: doublePrecision('attached_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
});

export const fileConversations = pgTable('file_conversations', {
  id: serial('id').primaryKey(),
  fileId: text('file_id').notNull(),
  conversationId: text('conversation_id').notNull(),
  attachedBy: text('attached_by').notNull(),
  attachedAt: doublePrecision('attached_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
});

export const contactConversations = pgTable('contact_conversations', {
  id: serial('id').primaryKey(),
  contactId: text('contact_id').notNull(),
  conversationId: text('conversation_id').notNull(),
});

export const contactProjects = pgTable('contact_projects', {
  id: serial('id').primaryKey(),
  contactId: text('contact_id').notNull(),
  projectId: text('project_id').notNull(),
});

// ── CRM Intelligence + Agent Templates ────────────────────────────────────────

export const contactAnalyses = pgTable('contact_analyses', {
  id: text('id').primaryKey(),
  contactId: text('contact_id').notNull(),
  sentiment: text('sentiment').notNull(),
  engagementScore: integer('engagement_score').notNull(),
  churnRisk: text('churn_risk').notNull(),
  relationshipStage: text('relationship_stage').notNull(),
  keyTopics: jsonb('key_topics').default(sql`'[]'::jsonb`),
  lastInteractionSummary: text('last_interaction_summary'),
  communicationStyle: text('communication_style'),
  rawJson: jsonb('raw_json'),
  jobId: text('job_id'),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
});

export const agentTemplates = pgTable('agent_templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  description: text('description'),
  tags: jsonb('tags').default(sql`'[]'::jsonb`),
  skills: jsonb('skills').default(sql`'[]'::jsonb`),
  tools: jsonb('tools').default(sql`'[]'::jsonb`),
  requiredBackends: jsonb('required_backends').default(sql`'[]'::jsonb`),
  requiredTools: jsonb('required_tools').default(sql`'[]'::jsonb`),
  systemPrompt: text('system_prompt').notNull().default(''),
  soulText: text('soul_text').notNull().default(''),
  roleCardText: text('role_card_text').notNull().default(''),
  identityText: text('identity_text').notNull().default(''),
  skillsText: text('skills_text').notNull().default(''),  // DEPRECATED (SOT-05): preserved but never read during instantiation
  isInternal: integer('is_internal').notNull().default(0),
  sortOrder: integer('sort_order').default(50),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
  // ── RPG Fields (v4.0) ────────────────────────────────────────────────────
  shell: text('shell').default('builder'),
  shellIcon: text('shell_icon').default(''),
  shellColor: text('shell_color').default(''),
  intelligence: jsonb('intelligence').default(sql`'{}'::jsonb`),
  supports: jsonb('supports').default(sql`'[]'::jsonb`),
  equipmentSlots: jsonb('equipment_slots').default(sql`'[]'::jsonb`),
  passiveTree: jsonb('passive_tree').default(sql`'[]'::jsonb`),
  level: integer('level').default(1),
  xp: integer('xp').default(0),
  starLevel: integer('star_level').default(1),
  rarity: text('rarity').default('common'),
  eloRating: integer('elo_rating').default(1200),
  specialties: jsonb('specialties').default(sql`'[]'::jsonb`),
  rpgEnabled: integer('rpg_enabled').default(0),
});

// ── Autonomous Learning + Memory V2 Concepts ─────────────────────────────────

export const concepts = pgTable('concepts', {
  id: text('id').primaryKey(),
  memoryKind: text('memory_kind').notNull().default('concept'),
  trustTier: text('trust_tier').notNull().default('low'),
  scope: text('scope').notNull().default('global'),
  scopeId: text('scope_id'),
  content: text('content').notNull(),
  sourceType: text('source_type').notNull().default('learning'),
  sourceUrl: text('source_url'),
  confidenceScore: integer('confidence_score').notNull().default(0),
  status: text('status').notNull().default('active'),
  reviewState: text('review_state').notNull().default('accepted'),
  supersededById: text('superseded_by_id'),
  lastUsedAt: doublePrecision('last_used_at'),
  useCount: integer('use_count').notNull().default(0),
  sessionId: text('session_id'),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
  updatedAt: doublePrecision('updated_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
  searchVector: tsvector('search_vector'),
  migratedToV3: integer('migrated_to_v3').default(0),
});

export const learningSessions = pgTable('learning_sessions', {
  id: text('id').primaryKey(),
  templateId: text('template_id').notNull(),
  jobId: text('job_id'),
  sourcesVisited: jsonb('sources_visited').default(sql`'[]'::jsonb`),
  conceptsRetained: integer('concepts_retained').notNull().default(0),
  confidenceDistribution: jsonb('confidence_distribution').default(sql`'{"high":0,"medium":0,"low":0}'::jsonb`),
  capped: integer('capped').notNull().default(0),
  durationMs: integer('duration_ms'),
  error: text('error'),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
});

// ── Admin: Customer Intelligence ──────────────────────────────────────────────

export const customerEvents = pgTable('customer_events', {
  id: serial('id').primaryKey(),
  username: text('username').notNull(),
  eventType: text('event_type').notNull(),
  eventData: jsonb('event_data').default(sql`'{}'::jsonb`),
  ipAddress: text('ip_address'),
  country: text('country'),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
});

export const customerScores = pgTable('customer_scores', {
  username: text('username').primaryKey(),
  health: integer('health').default(50),
  conversionScore: integer('conversion_score').default(0),
  churnRisk: integer('churn_risk').default(50),
  viralScore: integer('viral_score').default(0),
  ltvPredicted: doublePrecision('ltv_predicted').default(0),
  nextAction: text('next_action').default(''),
  computedAt: doublePrecision('computed_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
});

export const adminAgentTasks = pgTable('admin_agent_tasks', {
  id: serial('id').primaryKey(),
  agentType: text('agent_type').notNull(),
  actionType: text('action_type').notNull(),
  targetUsername: text('target_username'),
  status: text('status').default('queued'),
  priority: integer('priority').default(50),
  payload: jsonb('payload').default(sql`'{}'::jsonb`),
  result: text('result'),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
  startedAt: doublePrecision('started_at'),
  completedAt: doublePrecision('completed_at'),
});

// ── Admin: Error Tracking ─────────────────────────────────────────────────────

export const errorLog = pgTable('error_log', {
  id: serial('id').primaryKey(),
  source: text('source').notNull(),
  severity: text('severity').default('error'),
  message: text('message').notNull(),
  stack: text('stack'),
  url: text('url'),
  username: text('username'),
  userAgent: text('user_agent'),
  ipAddress: text('ip_address'),
  metadata: jsonb('metadata').default(sql`'{}'::jsonb`),
  resolved: integer('resolved').default(0),
  resolvedBy: text('resolved_by'),
  resolvedAt: doublePrecision('resolved_at'),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
});

// ── Admin: Email System ───────────────────────────────────────────────────────

export const emailMessages = pgTable('email_messages', {
  id: serial('id').primaryKey(),
  folder: text('folder').notNull().default('drafts'),
  fromEmail: text('from_email').notNull().default(''),
  fromName: text('from_name').notNull().default(''),
  toEmail: text('to_email').notNull().default(''),
  toName: text('to_name').notNull().default(''),
  cc: text('cc').notNull().default(''),
  bcc: text('bcc').notNull().default(''),
  subject: text('subject').notNull().default(''),
  body: text('body').notNull().default(''),
  bodyHtml: text('body_html').notNull().default(''),
  status: text('status').notNull().default('draft'),
  sentAt: doublePrecision('sent_at'),
  readAt: doublePrecision('read_at'),
  error: text('error'),
  inReplyTo: integer('in_reply_to'),
  threadId: text('thread_id'),
  createdAt: doublePrecision('created_at').notNull().default(sql`EXTRACT(EPOCH FROM NOW())`),
  updatedAt: doublePrecision('updated_at').notNull().default(sql`EXTRACT(EPOCH FROM NOW())`),
});

// ── Admin: Workspace Settings ─────────────────────────────────────────────────

export const workspaceSettings = pgTable('workspace_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

// ── Admin: Forge Pipeline ─────────────────────────────────────────────────────

export const forgePipeline = pgTable('forge_pipeline', {
  id: text('id').primaryKey(),
  templateId: text('template_id').notNull(),
  agentId: text('agent_id'),
  station: integer('station').notNull().default(0),
  status: text('status').notNull().default('queued'),
  flags: jsonb('flags').default(sql`'[]'::jsonb`),
  instanceLearnings: jsonb('instance_learnings').default(sql`'{}'::jsonb`),
  wave: integer('wave').notNull().default(0),
  tokensUsed: integer('tokens_used').default(0),
  workerId: text('worker_id'),
  leaseExpiresAt: doublePrecision('lease_expires_at'),
  attemptCount: integer('attempt_count').default(0),
  maxAttempts: integer('max_attempts').default(3),
  startedAt: doublePrecision('started_at'),
  completedAt: doublePrecision('completed_at'),
  error: text('error'),
  cycle: integer('cycle').notNull().default(1),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
  updatedAt: doublePrecision('updated_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
});

export const forgeStationRuns = pgTable('forge_station_runs', {
  id: text('id').primaryKey(),
  pipelineId: text('pipeline_id').notNull(),
  station: integer('station').notNull(),
  phase: text('phase').notNull(),
  runSequence: integer('run_sequence').notNull().default(1),
  status: text('status').notNull().default('running'),
  writerModel: text('writer_model'),
  checkerModel: text('checker_model'),
  qualityScore: integer('quality_score'),
  rubric: jsonb('rubric').default(sql`'{}'::jsonb`),
  qaRationale: text('qa_rationale'),
  filesTouched: jsonb('files_touched').default(sql`'[]'::jsonb`),
  skillsAssigned: jsonb('skills_assigned').default(sql`'[]'::jsonb`),
  toolsMapped: jsonb('tools_mapped').default(sql`'[]'::jsonb`),
  flags: jsonb('flags').default(sql`'[]'::jsonb`),
  tokensUsed: integer('tokens_used').default(0),
  costReserved: doublePrecision('cost_reserved').default(0),
  costActual: doublePrecision('cost_actual').default(0),
  promptVersion: text('prompt_version'),
  durationMs: integer('duration_ms'),
  startedAt: doublePrecision('started_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
  completedAt: doublePrecision('completed_at'),
});

export const forgeSettings = pgTable('forge_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

// ── Admin: Audit Log ──────────────────────────────────────────────────────────

export const auditLog = pgTable('audit_log', {
  id: serial('id').primaryKey(),
  ts: doublePrecision('ts').notNull(),
  tsIso: text('ts_iso').notNull(),
  actor: text('actor').notNull(),
  actorType: text('actor_type').default('session'),
  action: text('action').notNull(),
  target: text('target'),
  details: jsonb('details').default(sql`'{}'::jsonb`),
  projectId: text('project_id'),
  sessionId: text('session_id'),
  ipAddress: text('ip_address'),
});

// ── Admin: Invites ────────────────────────────────────────────────────────────

export const invites = pgTable('invites', {
  code: text('code').primaryKey(),
  role: text('role').default('operator'),
  createdBy: text('created_by').notNull(),
  createdAt: doublePrecision('created_at').notNull().default(sql`EXTRACT(EPOCH FROM NOW())`),
  expiresAt: doublePrecision('expires_at'),
  maxUses: integer('max_uses').default(1),
  useCount: integer('use_count').default(0),
  status: text('status').default('active'),
});

export const inviteUses = pgTable('invite_uses', {
  id: serial('id').primaryKey(),
  inviteCode: text('invite_code').notNull(),
  username: text('username').notNull(),
  usedAt: doublePrecision('used_at').notNull().default(sql`EXTRACT(EPOCH FROM NOW())`),
});

// ── Agent Messages (legacy, used by admin health) ─────────────────────────────

export const agentMessages = pgTable('agent_messages', {
  id: serial('id').primaryKey(),
  runId: text('run_id').notNull(),
  fromAgent: text('from_agent').notNull().default('porter'),
  toAgent: text('to_agent').notNull(),
  message: text('message').notNull(),
  response: text('response'),
  status: text('status').notNull().default('pending'),
  model: text('model'),
  tokensTotal: integer('tokens_total').default(0),
  durationMs: integer('duration_ms').default(0),
  error: text('error'),
  createdAt: doublePrecision('created_at').notNull().default(sql`EXTRACT(EPOCH FROM NOW())`),
  completedAt: doublePrecision('completed_at'),
  chainId: text('chain_id'),
  stepNum: integer('step_num').default(0),
  injectedMemories: jsonb('injected_memories').default(sql`'[]'::jsonb`),
  // SIN-01: FTS search vector (Phase 41) — actual tsvector type managed by raw SQL migration
  searchVector: text('search_vector'),
});

// ── Memory V3: Structured State Tables ───────────────────────────────────────

// Workspace and project-scoped directives (operating rules injected into every prompt)
// scope values: 'workspace' | 'project'
// sourceType values: 'system' | 'human' | 'agent' | 'email' | 'file' | 'external'
// status values: 'active' | 'archived'
export const directives = pgTable('directives', {
  id: text('id').primaryKey(),
  scope: text('scope').notNull().default('workspace'),
  scopeId: text('scope_id'),           // null for workspace scope; project_id for project scope
  content: text('content').notNull(),
  priority: integer('priority').notNull().default(50),  // lower = higher injection priority
  sourceType: text('source_type').notNull().default('system'),
  status: text('status').notNull().default('active'),
  createdBy: text('created_by'),        // username or 'system'
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
  updatedAt: doublePrecision('updated_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
});

// Project-scoped notes (state, decisions, constraints)
// noteType values: 'state' | 'decision' | 'constraint'
// sourceType values: 'agent' | 'human' | 'system' | 'email' | 'file' | 'external'
export const projectNotes = pgTable('project_notes', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  content: text('content').notNull(),
  noteType: text('note_type').notNull().default('state'),
  confidenceScore: integer('confidence_score').notNull().default(70),
  sourceType: text('source_type').notNull().default('agent'),
  status: text('status').notNull().default('active'),
  createdBy: text('created_by'),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
  updatedAt: doublePrecision('updated_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
});

// Agent-scoped notes (learnings, directives, constraints per persona)
// noteType values: 'learning' | 'directive' | 'constraint'
// sourceType values: 'learning' | 'self_edit' | 'human' | 'email' | 'file' | 'external'
export const agentNotes = pgTable('agent_notes', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull(),  // references personas.id
  content: text('content').notNull(),
  noteType: text('note_type').notNull().default('learning'),
  confidenceScore: integer('confidence_score').notNull().default(50),
  sourceType: text('source_type').notNull().default('learning'),
  status: text('status').notNull().default('active'),
  supersededById: text('superseded_by_id'),  // for consolidation linkage
  createdBy: text('created_by'),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
  updatedAt: doublePrecision('updated_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
});

// ── Persona Skills (junction table, used by forge) ────────────────────────────

export const personaSkills = pgTable('persona_skills', {
  personaId: text('persona_id').notNull(),
  skillName: text('skill_name').notNull(),      // DEPRECATED — retained for backwards compat
  skillId: text('skill_id'),                     // NEW: FK to skills.id — canonical after migration
  enabled: integer('enabled').default(1),
  assignedAt: doublePrecision('assigned_at').notNull().default(sql`EXTRACT(EPOCH FROM NOW())`),
  // Phase 34: feedback telemetry counters
  timesSelected: integer('times_selected').default(0),
  timesCompleted: integer('times_completed').default(0),
  positiveFeedbackCount: integer('positive_feedback_count').default(0),
  negativeFeedbackCount: integer('negative_feedback_count').default(0),
  lastUsedAt: doublePrecision('last_used_at'),
  effectivenessScore: doublePrecision('effectiveness_score'),
});
// Note: Primary key (persona_id, skill_name) defined in migration DDL

// ── Skill Feedback Events (Phase 34) ─────────────────────────────────────────

export const skillFeedbackEvents = pgTable('skill_feedback_events', {
  id: text('id').primaryKey(),
  personaId: text('persona_id').notNull(),
  skillId: text('skill_id').notNull(),
  dispatchId: text('dispatch_id').notNull(),
  // event_type values: positive, negative, correction, retry, abandon, success
  eventType: text('event_type').notNull(),
  note: text('note'),
  createdAt: doublePrecision('created_at').notNull().default(sql`EXTRACT(EPOCH FROM NOW())`),
});

// ── Skills & Tools Registry (Phase 15) ──────────────────────────────────────

export const skills = pgTable('skills', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').default(''),
  category: text('category').notNull(),
  source: text('source').default('porter-curated'),
  enabled: integer('enabled').default(1),
  visible: integer('visible').default(1),
  featured: integer('featured').default(0),
  icon: text('icon').default(''),
  color: text('color').default(''),
  coverImage: text('cover_image').default(''),
  shortLabel: text('short_label').default(''),
  sortOrder: integer('sort_order').default(50),
  featuredOrder: integer('featured_order').default(0),
  configSchema: jsonb('config_schema').default(sql`'{}'::jsonb`),
  qualityScore: doublePrecision('quality_score').default(0),
  qualityTier: text('quality_tier').default('scaffold'),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
  updatedAt: doublePrecision('updated_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
});

export const tools = pgTable('tools', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').default(''),
  category: text('category').notNull(),
  type: text('type').notNull().default('system'),
  enabled: integer('enabled').default(1),
  visible: integer('visible').default(1),
  featured: integer('featured').default(0),
  icon: text('icon').default(''),
  color: text('color').default(''),
  coverImage: text('cover_image').default(''),
  shortLabel: text('short_label').default(''),
  sortOrder: integer('sort_order').default(50),
  featuredOrder: integer('featured_order').default(0),
  configSchema: jsonb('config_schema').default(sql`'{}'::jsonb`),
  requires: jsonb('requires').default(sql`'[]'::jsonb`),
  version: text('version').default(''),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
  updatedAt: doublePrecision('updated_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
});

export const templateSkills = pgTable('template_skills', {
  templateId: text('template_id').notNull(),
  skillId: text('skill_id').notNull(),
  sortOrder: integer('sort_order').default(0),
  isMandatory: integer('is_mandatory').default(0),
  assignmentRationale: text('assignment_rationale').default(''),
  // ── RPG Fields (v4.0) ────────────────────────────────────────────────────
  successRate30d: doublePrecision('success_rate_30d').default(0),
  totalUses: integer('total_uses').default(0),
  lastUsed: doublePrecision('last_used'),
});
// Note: Primary key (template_id, skill_id) defined in migration DDL

export const templateTools = pgTable('template_tools', {
  templateId: text('template_id').notNull(),
  toolId: text('tool_id').notNull(),
  sortOrder: integer('sort_order').default(0),
});
// Note: Primary key (template_id, tool_id) defined in migration DDL

// ── Bridge: AI Gateway Registry (Phase 16) ──────────────────────────────────

export const gateways = pgTable('gateways', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  name: text('name').notNull(),
  url: text('url'),
  authMethod: text('auth_method').notNull().default('none'),
  status: text('status').notNull().default('active'),
  source: text('source').notNull().default('manual'),
  priority: integer('priority').notNull().default(10),
  capabilities: jsonb('capabilities').default(sql`'[]'::jsonb`),
  metadata: jsonb('metadata').default(sql`'{}'::jsonb`),
  enabled: integer('enabled').notNull().default(1),
  maskedDisplay: text('masked_display').default(''),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
  updatedAt: doublePrecision('updated_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
  lastHealthAt: doublePrecision('last_health_at'),
});

export const gatewayCredentials = pgTable('gateway_credentials', {
  id: text('id').primaryKey(),
  gatewayId: text('gateway_id').notNull().references(() => gateways.id, { onDelete: 'cascade' }),
  label: text('label').notNull().default('primary'),
  encryptedValue: text('encrypted_value').notNull(),
  maskedDisplay: text('masked_display').notNull().default(''),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
  rotatedAt: doublePrecision('rotated_at'),
});

// ── Bridge: Smart Routing Engine (Phase 20) ──────────────────────────────────

export const routingRules = pgTable('routing_rules', {
  id: text('id').primaryKey(),
  scope: text('scope').notNull().default('global'),
  scopeId: text('scope_id'),
  action: text('action').notNull(),
  actionValue: text('action_value'),
  enabled: integer('enabled').notNull().default(1),
  priority: integer('priority').notNull().default(50),
  description: text('description'),
  createdBy: text('created_by'),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
  updatedAt: doublePrecision('updated_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
});

export const bridgeDispatchLog = pgTable('bridge_dispatch_log', {
  id: text('id').primaryKey(),
  gatewayId: text('gateway_id'),
  gatewayType: text('gateway_type').notNull(),
  modelName: text('model_name').notNull(),
  chosenReason: text('chosen_reason').notNull(),
  alternatives: jsonb('alternatives').default(sql`'[]'::jsonb`),
  estimatedCostUsd: doublePrecision('estimated_cost_usd'),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  // cached_tokens: prompt-cache hit token count (added bridge_v4)
  cachedTokens: integer('cached_tokens'),
  // model_version_id: FK to model_versions for cost attribution (added bridge_v4)
  modelVersionId: text('model_version_id'),
  latencyMs: integer('latency_ms'),
  agentId: text('agent_id'),
  projectId: text('project_id'),
  chatId: text('chat_id'),
  ruleId: text('rule_id'),
  // username: caller identity for per-user metering (added bridge_v5)
  username: text('username'),
  // Agent-message correlation fields (added bridge_v6)
  correlationId: text('correlation_id'),
  sourceAgent: text('source_agent'),
  sourceGateway: text('source_gateway'),
  targetAgent: text('target_agent'),
  targetGateway: text('target_gateway'),
  intent: text('intent'),
  replyTo: text('reply_to'),
  isAgentMessage: integer('is_agent_message'),
  // skills_used: runtime skill selection telemetry (added rts_v1)
  skillsUsed: jsonb('skills_used'),
  // SIN-01: outcome rating + note (Phase 41)
  outcomeScore: integer('outcome_score'),
  outcomeNote: text('outcome_note'),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
});

export const sessionRoutingContext = pgTable('session_routing_context', {
  id: text('id').primaryKey(),
  chatId: text('chat_id').notNull(),
  messageSequence: integer('message_sequence').notNull(),
  gatewayId: text('gateway_id'),
  gatewayType: text('gateway_type').notNull(),
  modelName: text('model_name').notNull(),
  dispatchLogId: text('dispatch_log_id'),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
});

// ── Model Catalog (Phase 19) ──────────────────────────────────────────────────

export const models = pgTable('models', {
  id: text('id').primaryKey(),
  gatewayId: text('gateway_id').notNull(),
  modelName: text('model_name').notNull(),
  capabilities: jsonb('capabilities').default(sql`'[]'::jsonb`),
  contextWindow: integer('context_window'),
  pricingInputPerM: doublePrecision('pricing_input_per_m'),
  pricingOutputPerM: doublePrecision('pricing_output_per_m'),
  benchmarkScores: jsonb('benchmark_scores').default(sql`'{}'::jsonb`),
  isActive: integer('is_active').notNull().default(1),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
  updatedAt: doublePrecision('updated_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
});

export const modelVersions = pgTable('model_versions', {
  id: text('id').primaryKey(),
  modelId: text('model_id').notNull(),
  versionLabel: text('version_label').notNull(),
  snapshot: jsonb('snapshot').default(sql`'{}'::jsonb`),
  detectedAt: doublePrecision('detected_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
});

// ── RPG & Arena (v4.0) ───────────────────────────────────────────────────────

export const agentRpgStats = pgTable('agent_rpg_stats', {
  id: text('id').primaryKey(),
  templateId: text('template_id').notNull(),
  quality: doublePrecision('quality').default(0),
  speed: doublePrecision('speed').default(0),
  efficiency: doublePrecision('efficiency').default(0),
  reliability: doublePrecision('reliability').default(0),
  combo: doublePrecision('combo').default(0),
  xp: integer('xp').default(0),
  level: integer('level').default(1),
  stars: integer('stars').default(1),
  rarity: text('rarity').default('common'),
  agentClass: text('agent_class').default('striker'),
  elo: integer('elo').default(1200),
  weaponModel: text('weapon_model'),
  armorPromptId: text('armor_prompt_id'),
  accessory1Tool: text('accessory1_tool'),
  accessory2Tool: text('accessory2_tool'),
  setBonusActive: integer('set_bonus_active').default(0),
  specialties: jsonb('specialties').default(sql`'[]'::jsonb`),
  dispatchCount: integer('dispatch_count').default(0),
  battleCount: integer('battle_count').default(0),
  lastComputed: doublePrecision('last_computed'),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
  updatedAt: doublePrecision('updated_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
});

export const battles = pgTable('battles', {
  id: text('id').primaryKey(),
  challengerId: text('challenger_id').notNull(),
  defenderId: text('defender_id').notNull(),
  prompt: text('prompt').notNull(),
  domain: text('domain').default('general'),
  status: text('status').default('pending'),
  winnerId: text('winner_id'),
  judgeModel: text('judge_model'),
  judgeScores: jsonb('judge_scores').default(sql`'{}'::jsonb`),
  challengerEloBefore: integer('challenger_elo_before'),
  defenderEloBefore: integer('defender_elo_before'),
  challengerEloAfter: integer('challenger_elo_after'),
  defenderEloAfter: integer('defender_elo_after'),
  challengerDispatchId: text('challenger_dispatch_id'),
  defenderDispatchId: text('defender_dispatch_id'),
  judgeDispatchId: text('judge_dispatch_id'),
  initiatedBy: text('initiated_by'),
  spectators: jsonb('spectators').default(sql`'[]'::jsonb`),
  replayData: jsonb('replay_data').default(sql`'{}'::jsonb`),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
  completedAt: doublePrecision('completed_at'),
});

export const battleRounds = pgTable('battle_rounds', {
  id: text('id').primaryKey(),
  battleId: text('battle_id').notNull(),
  roundNum: integer('round_num').notNull(),
  challengerResponse: text('challenger_response'),
  defenderResponse: text('defender_response'),
  challengerTokens: integer('challenger_tokens'),
  defenderTokens: integer('defender_tokens'),
  challengerLatencyMs: integer('challenger_latency_ms'),
  defenderLatencyMs: integer('defender_latency_ms'),
  roundWinner: text('round_winner'),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
});

export const battleJudgments = pgTable('battle_judgments', {
  id: text('id').primaryKey(),
  battleId: text('battle_id').notNull(),
  judgeModel: text('judge_model').notNull(),
  qualityScore: doublePrecision('quality_score'),
  speedScore: doublePrecision('speed_score'),
  efficiencyScore: doublePrecision('efficiency_score'),
  styleScore: doublePrecision('style_score'),
  rationale: text('rationale'),
  verdict: text('verdict'),
  confidence: doublePrecision('confidence'),
  rawResponse: text('raw_response'),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
});

export const agentBonds = pgTable('agent_bonds', {
  id: text('id').primaryKey(),
  agentAId: text('agent_a_id').notNull(),
  agentBId: text('agent_b_id').notNull(),
  chainCount: integer('chain_count').default(0),
  successCount: integer('success_count').default(0),
  comboScore: doublePrecision('combo_score').default(0),
  lastChained: doublePrecision('last_chained'),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
});

export const sessionRegistry = pgTable('session_registry', {
  id: text('id').primaryKey(),
  chatId: text('chat_id'),
  agentId: text('agent_id'),
  username: text('username'),
  gatewayType: text('gateway_type'),
  modelName: text('model_name'),
  tokenBudget: integer('token_budget').default(0),
  tokensUsed: integer('tokens_used').default(0),
  contextMsgs: integer('context_msgs').default(0),
  status: text('status').default('active'),
  metadata: jsonb('metadata').default(sql`'{}'::jsonb`),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
  lastActiveAt: doublePrecision('last_active_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
  closedAt: doublePrecision('closed_at'),
  // SIN-01: frozen memory snapshot (Phase 41)
  memorySnapshot: text('memory_snapshot'),
  frozenAt: doublePrecision('frozen_at'),
});

export const msgBusEvents = pgTable('msg_bus_events', {
  id: text('id').primaryKey(),
  correlationId: text('correlation_id'),
  sourceAgent: text('source_agent'),
  sourceGateway: text('source_gateway'),
  targetAgent: text('target_agent'),
  targetGateway: text('target_gateway'),
  intent: text('intent'),
  payload: jsonb('payload').default(sql`'{}'::jsonb`),
  responsePayload: jsonb('response_payload'),
  hopCount: integer('hop_count').default(0),
  latencyMs: integer('latency_ms'),
  dispatchLogId: text('dispatch_log_id'),
  status: text('status').default('pending'),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
  deliveredAt: doublePrecision('delivered_at'),
});

export const intelligencePatterns = pgTable('intelligence_patterns', {
  id: text('id').primaryKey(),
  patternType: text('pattern_type').notNull(),
  gatewayType: text('gateway_type'),
  agentId: text('agent_id'),
  summary: text('summary').notNull(),
  evidence: jsonb('evidence').default(sql`'[]'::jsonb`),
  confidence: integer('confidence').default(50),
  promotedToConceptId: text('promoted_to_concept_id'),
  status: text('status').default('raw'),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
  reviewedAt: doublePrecision('reviewed_at'),
});

// ── Bridge Tasks (Phase 39) ─────────────────────────────────────────────────

export const bridgeTasks = pgTable('bridge_tasks', {
  id: text('id').primaryKey(),
  gatewayType: text('gateway_type').notNull(),
  modelName: text('model_name').notNull().default(''),
  prompt: text('prompt').notNull(),
  cwd: text('cwd').notNull(),
  status: text('status').notNull().default('queued'),
  output: text('output'),
  error: text('error'),
  exitCode: integer('exit_code'),
  startedAt: doublePrecision('started_at'),
  completedAt: doublePrecision('completed_at'),
  durationMs: integer('duration_ms'),
  agentId: text('agent_id'),
  projectId: text('project_id'),
  username: text('username'),
  dispatchLogId: text('dispatch_log_id'),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
});

// ── Task Nodes (Phase 42 — Task Decomposition Engine) ─────────────────────────

export const taskNodes = pgTable('task_nodes', {
  id: text('id').primaryKey(),
  rootId: text('root_id').notNull(),
  parentId: text('parent_id'),
  projectId: text('project_id'),
  chatId: text('chat_id'),

  description: text('description').notNull(),
  taskType: text('task_type').default('general'),
  assignedAgentId: text('assigned_agent_id'),

  depth: integer('depth').default(0),
  dependencies: jsonb('dependencies').default(sql`'[]'::jsonb`),

  status: text('status').notNull().default('pending'),
  attempt: integer('attempt').default(0),
  maxAttempts: integer('max_attempts').default(3),

  context: jsonb('context').default(sql`'{}'::jsonb`),
  result: jsonb('result'),
  error: text('error'),

  tokenBudget: integer('token_budget'),
  tokensUsed: integer('tokens_used').default(0),

  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
  startedAt: doublePrecision('started_at'),
  completedAt: doublePrecision('completed_at'),
});
