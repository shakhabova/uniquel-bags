CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL
);
