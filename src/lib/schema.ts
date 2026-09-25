import { sql } from "drizzle-orm";
import { int, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// The schema is the ground truth for the database. To change it: edit here,
// run `pnpm db:generate` to turn the diff into a migration under drizzle/,
// and commit both — the migration applies automatically when the server
// boots (see src/lib/db.ts), locally and deployed. Never edit the database
// by hand: state on the deployed volume outlives every deploy, and the
// migration trail is what keeps old state and new code compatible.
//
// Two kinds of table live here. The reference tables (programs down to
// requirement_courses) are a transcript of Programs & Courses, rebuilt from
// src/data/ at every boot. The user tables (plans, plan_entries) are the only
// state a person creates, and they only ever change through the routes.

// ---------------------------------------------------------------- reference

export const programs = sqliteTable("programs", {
  code: text().primaryKey(), // 'MCOMP'
  name: text().notNull(),
  totalUnits: int("total_units").notNull(),
  sourceUrl: text("source_url").notNull(),
});

export const specialisations = sqliteTable("specialisations", {
  code: text().primaryKey(), // 'HCCM'
  programCode: text("program_code")
    .notNull()
    .references(() => programs.code),
  name: text().notNull(),
  units: int().notNull(),
  sourceUrl: text("source_url").notNull(),
});

export const courses = sqliteTable("courses", {
  code: text().primaryKey(), // 'COMP6442' — subject and level are read off the code
  title: text().notNull(),
  units: int().notNull(),
  // COMP8715 is taken twice; everything else once
  repeatable: int({ mode: "boolean" }).notNull().default(false),
  // false until the requisite text on the course page has been transcribed;
  // the planner says "not checked" rather than passing such a course silently
  requisitesVerified: int("requisites_verified", { mode: "boolean" }).notNull().default(false),
  sourceUrl: text("source_url").notNull(),
});

// Which half of the year a course runs in, as the 2026 course page lists it:
// 'S1', 'S2' or both. A plan reaches into years Programs & Courses hasn't
// published yet, so the pattern is assumed to repeat — a stated assumption,
// not a fact about 2027.
export const offerings = sqliteTable(
  "offerings",
  {
    courseCode: text("course_code")
      .notNull()
      .references(() => courses.code),
    semester: text({ enum: ["S1", "S2"] }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.courseCode, t.semester] })],
);

// A course's requisites, in the shape Programs & Courses writes them:
// options inside a group are OR, the groups are AND. A prereq group is met
// when one of its options sits in an earlier session (or the same session,
// when the page says "completed or currently studying"); an incompatible
// group is violated when any option is anywhere in the plan.
export const requisiteGroups = sqliteTable("requisite_groups", {
  id: int().primaryKey({ autoIncrement: true }),
  courseCode: text("course_code")
    .notNull()
    .references(() => courses.code),
  kind: text({ enum: ["prereq", "incompatible"] }).notNull(),
  concurrentOk: int("concurrent_ok", { mode: "boolean" }).notNull().default(false),
});

// An option may name a course outside the catalogue (COMP1110, say): the
// page lists it, so it is kept, but nothing in a plan can ever satisfy it.
export const requisiteOptions = sqliteTable(
  "requisite_options",
  {
    groupId: int("group_id")
      .notNull()
      .references(() => requisiteGroups.id, { onDelete: "cascade" }),
    courseCode: text("course_code").notNull(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.courseCode] })],
);

// One line of a program's or specialisation's requirements. `kind` says how
// the line counts: 'all' (every listed course), 'min'/'max' (units from the
// listed courses), 'level_min' (units at `level` in the plan overall),
// 'elective' (units from `subjects` not already counted).
export const requirementGroups = sqliteTable("requirement_groups", {
  id: int().primaryKey({ autoIncrement: true }),
  ownerKind: text("owner_kind", { enum: ["program", "specialisation"] }).notNull(),
  ownerCode: text("owner_code").notNull(),
  ordinal: int().notNull(),
  label: text().notNull(),
  kind: text({ enum: ["all", "min", "max", "level_min", "elective"] }).notNull(),
  units: int(),
  level: int(),
  subjects: text(),
});

export const requirementCourses = sqliteTable(
  "requirement_courses",
  {
    groupId: int("group_id")
      .notNull()
      .references(() => requirementGroups.id, { onDelete: "cascade" }),
    courseCode: text("course_code")
      .notNull()
      .references(() => courses.code),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.courseCode] })],
);

// --------------------------------------------------------------------- user

// A plan is addressed by its URL: the id is a short random slug, there is no
// login. It covers `semesters` sessions starting at `startSession`.
export const plans = sqliteTable("plans", {
  id: text().primaryKey(),
  name: text().notNull(),
  programCode: text("program_code")
    .notNull()
    .references(() => programs.code),
  specialisationCode: text("specialisation_code").references(() => specialisations.code),
  startSession: text("start_session").notNull(),
  semesters: int().notNull().default(4),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// One course placed in one session of one plan. A course appears in a plan
// at most once (repeatable courses included, for now — see README).
export const planEntries = sqliteTable(
  "plan_entries",
  {
    id: int().primaryKey({ autoIncrement: true }),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    courseCode: text("course_code")
      .notNull()
      .references(() => courses.code),
    session: text().notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [uniqueIndex("plan_entries_plan_course").on(t.planId, t.courseCode)],
);

export type Program = typeof programs.$inferSelect;
export type Specialisation = typeof specialisations.$inferSelect;
export type Course = typeof courses.$inferSelect;
export type Offering = typeof offerings.$inferSelect;
export type RequisiteGroup = typeof requisiteGroups.$inferSelect;
export type RequisiteOption = typeof requisiteOptions.$inferSelect;
export type RequirementGroup = typeof requirementGroups.$inferSelect;
export type RequirementCourse = typeof requirementCourses.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type PlanEntry = typeof planEntries.$inferSelect;
