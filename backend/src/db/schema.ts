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
