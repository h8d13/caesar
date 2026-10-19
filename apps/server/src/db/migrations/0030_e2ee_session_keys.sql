CREATE TABLE `e2ee_session_keys` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL REFERENCES `users`(`id`) ON DELETE cascade,
	`session_epoch` integer NOT NULL,
	`wrap_key` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `e2ee_session_keys_user_idx` ON `e2ee_session_keys` (`user_id`);
