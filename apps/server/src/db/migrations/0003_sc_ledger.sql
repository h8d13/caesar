CREATE TABLE `social_credit_ledger` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`target_id` integer NOT NULL REFERENCES `users`(`id`) ON DELETE cascade,
	`voter_id` integer REFERENCES `users`(`id`) ON DELETE cascade,
	`ledgerable_type` text,
	`ledgerable_id` integer,
	`amount` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sc_ledger_target_idx` ON `social_credit_ledger` (`target_id`);--> statement-breakpoint
CREATE INDEX `sc_ledger_type_ref_idx` ON `social_credit_ledger` (`ledgerable_type`, `ledgerable_id`);--> statement-breakpoint
CREATE INDEX `sc_ledger_voter_type_created_idx` ON `social_credit_ledger` (`voter_id`, `ledgerable_type`, `created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `sc_ledger_message_vote_unique` ON `social_credit_ledger` (`ledgerable_id`, `voter_id`) WHERE `ledgerable_type` = 'message_vote';--> statement-breakpoint
INSERT INTO `social_credit_ledger` (`target_id`, `amount`, `created_at`) SELECT `id`, `social_credit`, `created_at` FROM `users` WHERE `social_credit` != 0;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `social_credit`;
