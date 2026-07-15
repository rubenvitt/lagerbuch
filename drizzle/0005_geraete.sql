CREATE TABLE `geraete` (
	`id` text PRIMARY KEY NOT NULL,
	`typ` text NOT NULL,
	`barcode` text,
	`name` text NOT NULL,
	`lagerort_id` text NOT NULL,
	`anmerkung` text,
	`mtk_faellig` text,
	`beschreibung` text,
	`ablaufdatum` text,
	`aktiv` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`lagerort_id`) REFERENCES `lagerorte`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `geraete_barcode_unique` ON `geraete` (`barcode`);--> statement-breakpoint
CREATE INDEX `idx_geraete_lagerort` ON `geraete` (`lagerort_id`);