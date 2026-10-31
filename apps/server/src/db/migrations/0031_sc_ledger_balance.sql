ALTER TABLE `users` ADD `social_credit` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `users` SET `social_credit` = (SELECT COALESCE(SUM(`amount`), 0) FROM `social_credit_ledger` WHERE `target_id` = `users`.`id`);--> statement-breakpoint
CREATE TRIGGER `sc_ledger_balance_insert` AFTER INSERT ON `social_credit_ledger` BEGIN
	UPDATE `users` SET `social_credit` = `social_credit` + NEW.`amount` WHERE `id` = NEW.`target_id`;
END;--> statement-breakpoint
CREATE TRIGGER `sc_ledger_balance_update` AFTER UPDATE OF `amount` ON `social_credit_ledger` WHEN OLD.`target_id` = NEW.`target_id` BEGIN
	UPDATE `users` SET `social_credit` = `social_credit` + NEW.`amount` - OLD.`amount` WHERE `id` = NEW.`target_id`;
END;--> statement-breakpoint
CREATE TRIGGER `sc_ledger_balance_retarget` AFTER UPDATE OF `amount`, `target_id` ON `social_credit_ledger` WHEN OLD.`target_id` != NEW.`target_id` BEGIN
	UPDATE `users` SET `social_credit` = `social_credit` - OLD.`amount` WHERE `id` = OLD.`target_id`;
	UPDATE `users` SET `social_credit` = `social_credit` + NEW.`amount` WHERE `id` = NEW.`target_id`;
END;--> statement-breakpoint
CREATE TRIGGER `sc_ledger_balance_delete` AFTER DELETE ON `social_credit_ledger` BEGIN
	UPDATE `users` SET `social_credit` = `social_credit` - OLD.`amount` WHERE `id` = OLD.`target_id`;
END;
