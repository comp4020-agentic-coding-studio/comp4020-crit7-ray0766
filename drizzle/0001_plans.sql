CREATE TABLE `courses` (
	`code` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`units` integer NOT NULL,
	`repeatable` integer DEFAULT false NOT NULL,
	`requisites_verified` integer DEFAULT false NOT NULL,
	`source_url` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `offerings` (
	`course_code` text NOT NULL,
	`semester` text NOT NULL,
	PRIMARY KEY(`course_code`, `semester`),
	FOREIGN KEY (`course_code`) REFERENCES `courses`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `plan_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plan_id` text NOT NULL,
	`course_code` text NOT NULL,
	`session` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_code`) REFERENCES `courses`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plan_entries_plan_course` ON `plan_entries` (`plan_id`,`course_code`);--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`program_code` text NOT NULL,
	`specialisation_code` text,
	`start_session` text NOT NULL,
	`semesters` integer DEFAULT 4 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`program_code`) REFERENCES `programs`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`specialisation_code`) REFERENCES `specialisations`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `programs` (
	`code` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`total_units` integer NOT NULL,
	`source_url` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `requirement_courses` (
	`group_id` integer NOT NULL,
	`course_code` text NOT NULL,
	PRIMARY KEY(`group_id`, `course_code`),
	FOREIGN KEY (`group_id`) REFERENCES `requirement_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_code`) REFERENCES `courses`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `requirement_groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_kind` text NOT NULL,
	`owner_code` text NOT NULL,
	`ordinal` integer NOT NULL,
	`label` text NOT NULL,
	`kind` text NOT NULL,
	`units` integer,
	`level` integer,
	`subjects` text
);
--> statement-breakpoint
CREATE TABLE `requisite_groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`course_code` text NOT NULL,
	`kind` text NOT NULL,
	`concurrent_ok` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`course_code`) REFERENCES `courses`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `requisite_options` (
	`group_id` integer NOT NULL,
	`course_code` text NOT NULL,
	PRIMARY KEY(`group_id`, `course_code`),
	FOREIGN KEY (`group_id`) REFERENCES `requisite_groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `specialisations` (
	`code` text PRIMARY KEY NOT NULL,
	`program_code` text NOT NULL,
	`name` text NOT NULL,
	`units` integer NOT NULL,
	`source_url` text NOT NULL,
	FOREIGN KEY (`program_code`) REFERENCES `programs`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
DROP TABLE `messages`;