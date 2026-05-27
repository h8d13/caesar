CREATE TABLE `status_images` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL REFERENCES `users`(`id`) ON DELETE cascade,
	`file_id` integer NOT NULL REFERENCES `files`(`id`) ON DELETE cascade,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `status_images_user_idx` ON `status_images` (`user_id`);
--> statement-breakpoint
CREATE INDEX `status_images_expires_idx` ON `status_images` (`expires_at`);
