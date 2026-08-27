import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  phone: text('phone').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  salt: text('salt').notNull(),
  role: text('role').notNull().default('worker'),
  permissions: text('permissions').notNull().default('[]'),
  active: integer('active').notNull().default(1),
  createdAt: text('created_at').notNull(),
  lastLoginAt: text('last_login_at'),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [index('idx_sessions_token').on(table.tokenHash, table.expiresAt)]);

export const records = sqliteTable('records', {
  id: text('id').primaryKey(), module: text('module').notNull(), recordKey: text('record_key'),
  title: text('title').notNull(), status: text('status').notNull().default('active'), eventDate: text('event_date').notNull(),
  linkedId: text('linked_id'), data: text('data').notNull().default('{}'), archived: integer('archived').notNull().default(0),
  createdBy: text('created_by').notNull().references(() => users.id), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_records_module_date').on(table.module, table.eventDate),
  index('idx_records_linked_id').on(table.linkedId),
  index('idx_records_active').on(table.module, table.archived, table.status),
  uniqueIndex('idx_records_module_key').on(table.module, table.recordKey).where(sql`${table.recordKey} IS NOT NULL AND ${table.archived} = 0`),
]);

export const auditLog = sqliteTable('audit_log', {
  id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => users.id), action: text('action').notNull(),
  module: text('module').notNull(), recordId: text('record_id'), summary: text('summary').notNull(), createdAt: text('created_at').notNull(),
}, (table) => [index('idx_audit_created').on(table.createdAt)]);

export const files = sqliteTable('files', {
  id: text('id').primaryKey(), recordId: text('record_id'), objectKey: text('object_key').notNull().unique(), filename: text('filename').notNull(),
  contentType: text('content_type').notNull(), size: integer('size').notNull(), uploadedBy: text('uploaded_by').notNull(), createdAt: text('created_at').notNull(),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(), value: text('value').notNull(), updatedAt: text('updated_at').notNull(),
});
