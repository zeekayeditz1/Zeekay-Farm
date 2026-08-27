CREATE TABLE `users` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `phone` text NOT NULL,
  `password_hash` text NOT NULL,
  `salt` text NOT NULL,
  `role` text DEFAULT 'worker' NOT NULL,
  `permissions` text DEFAULT '[]' NOT NULL,
  `active` integer DEFAULT 1 NOT NULL,
  `created_at` text NOT NULL,
  `last_login_at` text
);
CREATE UNIQUE INDEX `users_phone_unique` ON `users` (`phone`);
CREATE TABLE `sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `token_hash` text NOT NULL,
  `expires_at` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);
CREATE UNIQUE INDEX `sessions_token_hash_unique` ON `sessions` (`token_hash`);
CREATE INDEX `idx_sessions_token` ON `sessions` (`token_hash`,`expires_at`);
CREATE TABLE `records` (
  `id` text PRIMARY KEY NOT NULL,
  `module` text NOT NULL,
  `record_key` text,
  `title` text NOT NULL,
  `status` text DEFAULT 'active' NOT NULL,
  `event_date` text NOT NULL,
  `linked_id` text,
  `data` text DEFAULT '{}' NOT NULL,
  `archived` integer DEFAULT 0 NOT NULL,
  `created_by` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`)
);
CREATE INDEX `idx_records_module_date` ON `records` (`module`,`event_date`);
CREATE INDEX `idx_records_linked_id` ON `records` (`linked_id`);
CREATE INDEX `idx_records_active` ON `records` (`module`,`archived`,`status`);
CREATE UNIQUE INDEX `idx_records_module_key` ON `records` (`module`,`record_key`) WHERE `record_key` IS NOT NULL AND `archived` = 0;
CREATE TABLE `audit_log` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `action` text NOT NULL,
  `module` text NOT NULL,
  `record_id` text,
  `summary` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);
CREATE INDEX `idx_audit_created` ON `audit_log` (`created_at`);
CREATE TABLE `files` (
  `id` text PRIMARY KEY NOT NULL,
  `record_id` text,
  `object_key` text NOT NULL,
  `filename` text NOT NULL,
  `content_type` text NOT NULL,
  `size` integer NOT NULL,
  `uploaded_by` text NOT NULL,
  `created_at` text NOT NULL
);
CREATE UNIQUE INDEX `files_object_key_unique` ON `files` (`object_key`);
CREATE TABLE `settings` (`key` text PRIMARY KEY NOT NULL, `value` text NOT NULL, `updated_at` text NOT NULL);
PRAGMA optimize;
