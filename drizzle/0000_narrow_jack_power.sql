CREATE TABLE `calendar_entries` (
	`id` integer PRIMARY KEY NOT NULL,
	`craftsmanId` integer NOT NULL,
	`kind` text NOT NULL,
	`start` integer NOT NULL,
	`end` integer NOT NULL,
	`title` text,
	FOREIGN KEY (`craftsmanId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `calendar_craftsman_start` ON `calendar_entries` (`craftsmanId`,`start`);--> statement-breakpoint
CREATE TABLE `images` (
	`id` integer PRIMARY KEY NOT NULL,
	`requestId` integer NOT NULL,
	`mime` text NOT NULL,
	`data` blob NOT NULL,
	FOREIGN KEY (`requestId`) REFERENCES `requests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `images_request` ON `images` (`requestId`);--> statement-breakpoint
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
CREATE INDEX `options_request` ON `options` (`requestId`);--> statement-breakpoint
CREATE TABLE `requests` (
	`id` integer PRIMARY KEY NOT NULL,
	`customerId` integer NOT NULL,
	`craftsmanId` integer NOT NULL,
	`description` text NOT NULL,
	`urgency` text NOT NULL,
	`urgencyRating` text,
	`ratedAt` integer,
	`appeal` text,
	`appealReason` text,
	`appealedAt` integer,
	`appealNotifiedAt` integer,
	`conditions` text NOT NULL,
	`chosenOptionId` integer,
	`cancelledAt` integer,
	FOREIGN KEY (`customerId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`craftsmanId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `requests_customer` ON `requests` (`customerId`);--> statement-breakpoint
CREATE INDEX `requests_craftsman` ON `requests` (`craftsmanId`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`trade` text,
	`plz` text,
	`ort` text,
	`notfall` text,
	`kurzfristig` text,
	`normal` text,
	`spaet` text,
	`pricing` text,
	`sessionVersion` integer DEFAULT 0 NOT NULL,
	`maxPerDay` integer,
	`phoneHash` text,
	`phoneHint` text,
	`deletedAt` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_phone_active` ON `users` (`phoneHash`) WHERE "users"."deletedAt" is null;