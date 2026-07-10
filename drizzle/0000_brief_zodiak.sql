CREATE TABLE `artikel` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`einheit` text NOT NULL,
	`fach` text NOT NULL,
	`mindestbestand` integer DEFAULT 0 NOT NULL,
	`aktiv` integer DEFAULT true NOT NULL,
	`bestellt_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `buchungen` (
	`id` text PRIMARY KEY NOT NULL,
	`ts` integer NOT NULL,
	`typ` text NOT NULL,
	`artikel_id` text NOT NULL,
	`charge_id` text NOT NULL,
	`lagerort_id` text NOT NULL,
	`menge` integer NOT NULL,
	`quelle_typ` text NOT NULL,
	`quelle_id` text NOT NULL,
	`referenz` text,
	`kommentar` text,
	FOREIGN KEY (`artikel_id`) REFERENCES `artikel`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`charge_id`) REFERENCES `chargen`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lagerort_id`) REFERENCES `lagerorte`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_buchungen_artikel` ON `buchungen` (`artikel_id`);--> statement-breakpoint
CREATE INDEX `idx_buchungen_charge` ON `buchungen` (`charge_id`);--> statement-breakpoint
CREATE INDEX `idx_buchungen_ts` ON `buchungen` (`ts`);--> statement-breakpoint
CREATE TABLE `chargen` (
	`id` text PRIMARY KEY NOT NULL,
	`artikel_id` text NOT NULL,
	`chargen_nr` text NOT NULL,
	`verfall` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`artikel_id`) REFERENCES `artikel`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_chargen_artikel_verfall` ON `chargen` (`artikel_id`,`verfall`);--> statement-breakpoint
CREATE TABLE `checks` (
	`id` text PRIMARY KEY NOT NULL,
	`fahrzeug_id` text NOT NULL,
	`quelle_typ` text NOT NULL,
	`quelle_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`ergebnis` text,
	FOREIGN KEY (`fahrzeug_id`) REFERENCES `lagerorte`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `lagerorte` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`typ` text NOT NULL,
	`kennung` text,
	`aktiv` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `soll_positionen` (
	`id` text PRIMARY KEY NOT NULL,
	`fahrzeug_id` text NOT NULL,
	`fach_label` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`artikel_id` text NOT NULL,
	`soll` integer NOT NULL,
	FOREIGN KEY (`fahrzeug_id`) REFERENCES `lagerorte`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`artikel_id`) REFERENCES `artikel`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_soll_fahrzeug` ON `soll_positionen` (`fahrzeug_id`);--> statement-breakpoint
CREATE TABLE `tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`label` text NOT NULL,
	`scope_lagerort_id` text,
	`aktiv` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`last_used_at` integer,
	FOREIGN KEY (`scope_lagerort_id`) REFERENCES `lagerorte`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tokens_code_unique` ON `tokens` (`code`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`email` text,
	`last_login_at` integer
);
