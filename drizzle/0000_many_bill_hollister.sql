CREATE TABLE `options` (
	`id` integer PRIMARY KEY NOT NULL,
	`requestId` integer NOT NULL,
	`proposedById` integer NOT NULL,
	`kind` text NOT NULL,
	`start` integer NOT NULL,
	`end` integer NOT NULL,
	`rejected` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`requestId`) REFERENCES `requests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`proposedById`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `requests` (
	`id` integer PRIMARY KEY NOT NULL,
	`customerId` integer NOT NULL,
	`craftsmanId` integer NOT NULL,
	`description` text NOT NULL,
	`chosenOptionId` integer,
	FOREIGN KEY (`customerId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`craftsmanId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`trade` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);