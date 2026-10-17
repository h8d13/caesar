-- Threads are gone: drop replies (reactions, file links and read states
-- cascade; orphaned files are swept by the cleanup-files cron), then the column.
DELETE FROM `messages` WHERE `parent_message_id` IS NOT NULL;
--> statement-breakpoint
DROP INDEX `messages_parent_idx`;
--> statement-breakpoint
ALTER TABLE `messages` DROP COLUMN `parent_message_id`;
