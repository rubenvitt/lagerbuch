CREATE TABLE `bz_geraete` (
	`id` text PRIMARY KEY NOT NULL,
	`barcode` text,
	`name` text NOT NULL,
	`lagerort_id` text NOT NULL,
	`streifen_lot` text,
	`level1_label` text,
	`level1_min` integer,
	`level1_max` integer,
	`level2_label` text,
	`level2_min` integer,
	`level2_max` integer,
	`aktiv` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`lagerort_id`) REFERENCES `lagerorte`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bz_geraete_barcode_unique` ON `bz_geraete` (`barcode`);--> statement-breakpoint
CREATE INDEX `idx_bz_geraete_lagerort` ON `bz_geraete` (`lagerort_id`);--> statement-breakpoint
CREATE TABLE `bz_kontrollen` (
	`id` text PRIMARY KEY NOT NULL,
	`geraet_id` text NOT NULL,
	`ts` integer NOT NULL,
	`quelle_typ` text NOT NULL,
	`quelle_id` text NOT NULL,
	`level1_wert` integer,
	`level1_im_bereich` integer,
	`level2_wert` integer,
	`level2_im_bereich` integer,
	`kompresse_verfall` text,
	`sticks` integer DEFAULT 0 NOT NULL,
	`lanzetten` integer DEFAULT 0 NOT NULL,
	`batterie_gewechselt` integer DEFAULT false NOT NULL,
	`kommentar` text,
	`bestanden` integer NOT NULL,
	`ref_snapshot` text,
	FOREIGN KEY (`geraet_id`) REFERENCES `bz_geraete`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_bz_kontrollen_geraet_ts` ON `bz_kontrollen` (`geraet_id`,`ts`);--> statement-breakpoint
CREATE TABLE `o2_flaschen` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`lagerort_id` text NOT NULL,
	`groesse_liter` integer,
	`nennfuelldruck_bar` integer DEFAULT 200 NOT NULL,
	`aktiv` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`lagerort_id`) REFERENCES `lagerorte`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_o2_flaschen_lagerort` ON `o2_flaschen` (`lagerort_id`);--> statement-breakpoint
CREATE TABLE `o2_messungen` (
	`id` text PRIMARY KEY NOT NULL,
	`flasche_id` text NOT NULL,
	`ts` integer NOT NULL,
	`druck_bar` integer NOT NULL,
	`quelle_typ` text NOT NULL,
	`quelle_id` text NOT NULL,
	`kommentar` text,
	FOREIGN KEY (`flasche_id`) REFERENCES `o2_flaschen`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_o2_messungen_flasche_ts` ON `o2_messungen` (`flasche_id`,`ts`);