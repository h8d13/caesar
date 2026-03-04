CREATE TABLE `sounds` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`file_id` integer NOT NULL REFERENCES `files`(`id`) ON DELETE cascade,
	`user_id` integer NOT NULL REFERENCES `users`(`id`) ON DELETE cascade,
	`created_at` integer NOT NULL,
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX `sounds_user_idx` ON `sounds` (`user_id`);--> statement-breakpoint
CREATE INDEX `sounds_file_idx` ON `sounds` (`file_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `sounds_name_idx` ON `sounds` (`name`);
