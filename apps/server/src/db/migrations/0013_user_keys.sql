CREATE TABLE `user_keys` (
	`user_id` integer PRIMARY KEY NOT NULL REFERENCES `users`(`id`) ON DELETE cascade,
	`public_key` text NOT NULL
);
