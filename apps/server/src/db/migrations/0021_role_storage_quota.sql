ALTER TABLE `roles` ADD `storage_quota_override_enabled` integer NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE `roles` ADD `storage_space_quota` integer NOT NULL DEFAULT 0;