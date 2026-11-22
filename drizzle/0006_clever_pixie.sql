ALTER TABLE `requests` ADD `ratedAt` integer;--> statement-breakpoint
CREATE INDEX `requests_customer` ON `requests` (`customerId`);--> statement-breakpoint
CREATE INDEX `requests_craftsman` ON `requests` (`craftsmanId`);--> statement-breakpoint
ALTER TABLE `users` ADD `sessionVersion` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `options_request` ON `options` (`requestId`);