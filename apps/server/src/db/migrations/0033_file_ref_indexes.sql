CREATE INDEX `users_avatar_idx` ON `users` (`avatar_id`);
--> statement-breakpoint
CREATE INDEX `users_banner_idx` ON `users` (`banner_id`);
--> statement-breakpoint
CREATE INDEX `reaction_file_idx` ON `message_reactions` (`file_id`);
--> statement-breakpoint
CREATE INDEX `status_images_file_idx` ON `status_images` (`file_id`);
