CREATE TABLE `crash_rounds` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`crash_point` real NOT NULL,
	`hash` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer
);
--> statement-breakpoint
CREATE TABLE `crash_bets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`round_id` integer NOT NULL REFERENCES `crash_rounds`(`id`) ON DELETE cascade,
	`user_id` integer NOT NULL,
	`amount` integer NOT NULL,
	`cashed_out_at` real,
	`profit` integer,
	`ledger_entry_id` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `crash_rounds_started_idx` ON `crash_rounds` (`started_at`);
--> statement-breakpoint
CREATE INDEX `crash_rounds_ended_idx` ON `crash_rounds` (`ended_at`);
--> statement-breakpoint
CREATE INDEX `crash_bets_round_idx` ON `crash_bets` (`round_id`);
--> statement-breakpoint
CREATE INDEX `crash_bets_user_idx` ON `crash_bets` (`user_id`);
--> statement-breakpoint
CREATE INDEX `crash_bets_round_user_idx` ON `crash_bets` (`round_id`, `user_id`);
