ALTER TABLE `logins` DROP COLUMN `hostname`;--> statement-breakpoint
ALTER TABLE `logins` DROP COLUMN `city`;--> statement-breakpoint
ALTER TABLE `logins` DROP COLUMN `region`;--> statement-breakpoint
ALTER TABLE `logins` DROP COLUMN `country`;--> statement-breakpoint
ALTER TABLE `logins` DROP COLUMN `loc`;--> statement-breakpoint
ALTER TABLE `logins` DROP COLUMN `org`;--> statement-breakpoint
ALTER TABLE `logins` DROP COLUMN `postal`;--> statement-breakpoint
ALTER TABLE `logins` DROP COLUMN `timezone`;--> statement-breakpoint
UPDATE `logins` SET `ip` = NULL;--> statement-breakpoint
UPDATE `activity_log` SET `ip` = NULL;
