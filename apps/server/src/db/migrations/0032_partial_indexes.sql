-- prune-expired cron: only ephemeral DM messages carry expires_at
CREATE INDEX `messages_expires_idx` ON `messages` (`expires_at`) WHERE `expires_at` IS NOT NULL;
--> statement-breakpoint
-- get-pinned: a channel's pins without walking its whole history
CREATE INDEX `messages_channel_pinned_idx` ON `messages` (`channel_id`,`created_at`) WHERE `pinned` = 1;
