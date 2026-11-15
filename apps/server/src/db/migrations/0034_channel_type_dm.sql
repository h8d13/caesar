-- DMs get their own channel type instead of VOICE + is_dm_channel, so a
-- VOICE channel is one that never holds messages or attachments.
UPDATE `channels` SET `type` = 'DM' WHERE `is_dm_channel` = 1;
--> statement-breakpoint
ALTER TABLE `channels` DROP COLUMN `is_dm_channel`;
--> statement-breakpoint
-- no client could post here; only a hand-written API call
DELETE FROM `messages` WHERE `channel_id` IN (SELECT `id` FROM `channels` WHERE `type` = 'VOICE');
--> statement-breakpoint
-- The token columns become nullable, NULL on VOICE channels. SQLite cannot
-- drop NOT NULL in place and rebuilding `channels` would cascade into
-- `messages`, so each column is swapped for a nullable copy.
DROP INDEX `channels_file_access_token_unique`;
--> statement-breakpoint
ALTER TABLE `channels` RENAME COLUMN `file_access_token` TO `file_access_token_old`;
--> statement-breakpoint
ALTER TABLE `channels` RENAME COLUMN `file_access_token_updated_at` TO `file_access_token_updated_at_old`;
--> statement-breakpoint
ALTER TABLE `channels` ADD `file_access_token` text;
--> statement-breakpoint
ALTER TABLE `channels` ADD `file_access_token_updated_at` integer;
--> statement-breakpoint
UPDATE `channels` SET `file_access_token` = `file_access_token_old`, `file_access_token_updated_at` = `file_access_token_updated_at_old` WHERE `type` <> 'VOICE';
--> statement-breakpoint
ALTER TABLE `channels` DROP COLUMN `file_access_token_old`;
--> statement-breakpoint
ALTER TABLE `channels` DROP COLUMN `file_access_token_updated_at_old`;
--> statement-breakpoint
CREATE UNIQUE INDEX `channels_file_access_token_unique` ON `channels` (`file_access_token`);
