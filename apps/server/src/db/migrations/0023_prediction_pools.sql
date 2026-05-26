CREATE TABLE `prediction_pools` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`creator_id` integer NOT NULL REFERENCES `users`(`id`) ON DELETE cascade,
	`question` text NOT NULL,
	`status` text NOT NULL,
	`closes_at` integer NOT NULL,
	`winning_option_id` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `prediction_options` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pool_id` integer NOT NULL REFERENCES `prediction_pools`(`id`) ON DELETE cascade,
	`label` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `prediction_bets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pool_id` integer NOT NULL REFERENCES `prediction_pools`(`id`) ON DELETE cascade,
	`option_id` integer NOT NULL REFERENCES `prediction_options`(`id`) ON DELETE cascade,
	`user_id` integer NOT NULL,
	`amount` integer NOT NULL,
	`ledger_entry_id` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `prediction_pools_status_idx` ON `prediction_pools` (`status`);
--> statement-breakpoint
CREATE INDEX `prediction_pools_created_idx` ON `prediction_pools` (`created_at`);
--> statement-breakpoint
CREATE INDEX `prediction_options_pool_idx` ON `prediction_options` (`pool_id`);
--> statement-breakpoint
CREATE INDEX `prediction_bets_pool_idx` ON `prediction_bets` (`pool_id`);
--> statement-breakpoint
CREATE INDEX `prediction_bets_option_idx` ON `prediction_bets` (`option_id`);
--> statement-breakpoint
CREATE INDEX `prediction_bets_user_idx` ON `prediction_bets` (`user_id`);
