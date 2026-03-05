CREATE TABLE `roulette_rounds` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`winning_number` integer NOT NULL,
	`hash` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer
);
--> statement-breakpoint
CREATE TABLE `roulette_bets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`round_id` integer NOT NULL REFERENCES `roulette_rounds`(`id`) ON DELETE cascade,
	`user_id` integer NOT NULL,
	`bet_type` text NOT NULL,
	`bet_value` integer,
	`amount` integer NOT NULL,
	`profit` integer,
	`ledger_entry_id` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `roulette_rounds_started_idx` ON `roulette_rounds` (`started_at`);
--> statement-breakpoint
CREATE INDEX `roulette_rounds_ended_idx` ON `roulette_rounds` (`ended_at`);
--> statement-breakpoint
CREATE INDEX `roulette_bets_round_idx` ON `roulette_bets` (`round_id`);
--> statement-breakpoint
CREATE INDEX `roulette_bets_user_idx` ON `roulette_bets` (`user_id`);
--> statement-breakpoint
CREATE INDEX `roulette_bets_round_user_idx` ON `roulette_bets` (`round_id`, `user_id`);
