CREATE TABLE `appointments` (
	`id` integer PRIMARY KEY NOT NULL,
	`craftsmanId` integer NOT NULL,
	`start` integer NOT NULL,
	`customerName` text NOT NULL,
	`customerEmail` text NOT NULL,
	FOREIGN KEY (`craftsmanId`) REFERENCES `craftsmen`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_booking_per_slot` ON `appointments` (`craftsmanId`,`start`);--> statement-breakpoint
CREATE TABLE `craftsmen` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`trade` text NOT NULL
);
