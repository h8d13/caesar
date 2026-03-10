CREATE TABLE `coinflip_games` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`creator_id` integer NOT NULL REFERENCES `users`(`id`) ON DELETE cascade,
	`creator_side` text NOT NULL,
	`amount` integer NOT NULL,
	`opponent_id` integer REFERENCES `users`(`id`) ON DELETE cascade,
	`status` text NOT NULL,
	`result` text,
	`winner_id` integer REFERENCES `users`(`id`) ON DELETE cascade,
	`creator_ledger_entry_id` integer,
	`opponent_ledger_entry_id` integer,
	`created_at` integer NOT NULL,
	`resolved_at` integer
);
--> statement-breakpoint
CREATE INDEX `coinflip_games_creator_idx` ON `coinflip_games` (`creator_id`);
--> statement-breakpoint
CREATE INDEX `coinflip_games_opponent_idx` ON `coinflip_games` (`opponent_id`);
--> statement-breakpoint
CREATE INDEX `coinflip_games_status_idx` ON `coinflip_games` (`status`);
--> statement-breakpoint
CREATE INDEX `coinflip_games_created_idx` ON `coinflip_games` (`created_at`);
