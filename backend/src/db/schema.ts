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
});

export const schemaMigrations = sqliteTable('schema_migrations', {
  id: text('id').primaryKey(),
  appliedAt: real('applied_at').default(sql`(strftime('%s','now'))`),
});
