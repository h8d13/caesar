ALTER TABLE `users` ADD `invited_by` integer REFERENCES `users`(`id`) ON DELETE set null;
--> statement-breakpoint
ALTER TABLE `users` ADD `invite_code` text;
--> statement-breakpoint
CREATE INDEX `users_invited_by_idx` ON `users` (`invited_by`);
--> statement-breakpoint
UPDATE `users` SET `invite_code` = (
	SELECT json_extract(`activity_log`.`details`, '$.code') FROM `activity_log`
	WHERE `activity_log`.`user_id` = `users`.`id`
		AND `activity_log`.`type` = 'USED_INVITE'
	ORDER BY `activity_log`.`id` LIMIT 1
);
--> statement-breakpoint
UPDATE `users` SET `invited_by` = (
	SELECT `invites`.`creator_id` FROM `invites`
	WHERE `invites`.`code` = `users`.`invite_code`
) WHERE `invite_code` IS NOT NULL;
