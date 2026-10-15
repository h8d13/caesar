ALTER TABLE `users` ADD `invited_by` integer REFERENCES `users`(`id`) ON DELETE set null;
--> statement-breakpoint
CREATE INDEX `users_invited_by_idx` ON `users` (`invited_by`);
--> statement-breakpoint
UPDATE `users` SET `invited_by` = (
	SELECT `invites`.`creator_id` FROM `activity_log`
	JOIN `invites`
		ON `invites`.`code` = json_extract(`activity_log`.`details`, '$.code')
	WHERE `activity_log`.`user_id` = `users`.`id`
		AND `activity_log`.`type` = 'USED_INVITE'
	ORDER BY `activity_log`.`id` LIMIT 1
);
