CREATE TABLE `fahrzeug_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`aktiv` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `template_positionen` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`fach_label` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`artikel_id` text NOT NULL,
	`soll` integer NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `fahrzeug_templates`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`artikel_id`) REFERENCES `artikel`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_template_pos_template` ON `template_positionen` (`template_id`);--> statement-breakpoint
ALTER TABLE `lagerorte` ADD `template_id` text REFERENCES fahrzeug_templates(id);--> statement-breakpoint
ALTER TABLE `soll_positionen` ADD `template_position_id` text REFERENCES template_positionen(id);--> statement-breakpoint
ALTER TABLE `soll_positionen` ADD `ueberschrieben` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `soll_positionen` ADD `entfernt` integer DEFAULT false NOT NULL;