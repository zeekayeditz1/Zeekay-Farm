CREATE INDEX IF NOT EXISTS `idx_sessions_user` ON `sessions` (`user_id`);
CREATE INDEX IF NOT EXISTS `idx_files_record` ON `files` (`record_id`);
CREATE TABLE IF NOT EXISTS `login_attempts` (
  `key` text PRIMARY KEY NOT NULL,
  `failures` integer DEFAULT 0 NOT NULL,
  `window_started_at` text NOT NULL,
  `blocked_until` text
);
