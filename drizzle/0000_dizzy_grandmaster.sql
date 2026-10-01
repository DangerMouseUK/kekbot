CREATE TABLE `connections` (
	`provider` text PRIMARY KEY NOT NULL,
	`secret` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`due_at` integer NOT NULL,
	`lease_until` integer,
	`lease_owner` text,
	`last_error` text,
	`created_at` integer NOT NULL,
	CONSTRAINT "jobs_status" CHECK("jobs"."status" IN ('pending','running','succeeded','failed','uncertain')),
	CONSTRAINT "jobs_attempts" CHECK("jobs"."attempts" >= 0)
);
--> statement-breakpoint
CREATE INDEX `jobs_due` ON `jobs` (`status`,`due_at`);--> statement-breakpoint
CREATE TABLE `leases` (
	`name` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `oauth_states` (
	`id` text PRIMARY KEY NOT NULL,
	`verifier` text NOT NULL,
	`browser_binding` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`event_type` text NOT NULL,
	`payload` text,
	`received_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `receipts_received_at` ON `receipts` (`received_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
