DROP INDEX `plan_entries_plan_course`;--> statement-breakpoint
CREATE INDEX `plan_entries_plan` ON `plan_entries` (`plan_id`);