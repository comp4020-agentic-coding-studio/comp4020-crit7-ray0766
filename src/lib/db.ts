import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { and, asc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { Catalogue } from "./catalogue";
import * as schema from "./schema";
import { type Plan, type PlanEntry, planEntries, plans } from "./schema";
import { loadCatalogue, seedDemoPlan, seedReferenceData } from "./seed";
import { previousSession } from "./sessions";

// One SQLite file is the app's whole persistent state. In production
// fly.toml points DATABASE_PATH at the machine's volume (/data), which is
// how state survives a reload and a redeploy; locally it defaults to an
// untracked file in .data/.
const path = process.env.DATABASE_PATH ?? "./.data/app.db";
mkdirSync(dirname(path), { recursive: true });

const client = new Database(path);
client.pragma("journal_mode = WAL");
// SQLite only enforces the schema's foreign keys when asked to, per connection
client.pragma("foreign_keys = ON");

export const db = drizzle(client, { schema });

// Migrations run when this module loads, on whatever machine holds the
// volume — the recommended shape for SQLite on Fly, where there's no separate
// machine to run them from. src/middleware.ts imports this module, so that
// is the first request the server handles, whatever the route. The flow:
// edit src/lib/schema.ts, `pnpm db:generate`, commit the migration it writes
// to drizzle/.
migrate(db, { migrationsFolder: "./drizzle" });

// Then the reference tables are rebuilt from src/data/ and the demo plan is
// made if it is missing. Only after that is the catalogue read back.
seedReferenceData(db);
seedDemoPlan(db);

// Reference data changes only at boot, so one read serves every request.
const catalogue: Catalogue = loadCatalogue(db);

export function getCatalogue(): Catalogue {
  return catalogue;
}

export type { Plan, PlanEntry };

// ------------------------------------------------------------------- plans

export function getPlan(id: string): Plan | undefined {
  return db.select().from(plans).where(eq(plans.id, id)).get();
}

export function listEntries(planId: string): PlanEntry[] {
  return db
    .select()
    .from(planEntries)
    .where(eq(planEntries.planId, planId))
    .orderBy(asc(planEntries.session), asc(planEntries.id))
    .all();
}

export interface NewPlan {
  id?: string;
  name: string;
  programCode: string;
  specialisationCode: string | null;
  startSession: string;
  semesters?: number;
}

// The id is the plan's whole identity — there is no login — so it is random
// and short enough to read out: 8 url-safe characters, 48 bits.
export function createPlan(input: NewPlan): Plan {
  const id = input.id ?? randomBytes(6).toString("base64url");
  return db
    .insert(plans)
    .values({
      id,
      name: input.name,
      programCode: input.programCode,
      specialisationCode: input.specialisationCode,
      startSession: input.startSession,
      semesters: input.semesters ?? 4,
    })
    .returning()
    .get();
}

export function addEntry(planId: string, courseCode: string, session: string): PlanEntry {
  return db.insert(planEntries).values({ planId, courseCode, session }).returning().get();
}

/** How many times a course is already in a plan (0, 1, or 2 for COMP8715). */
export function countEntries(planId: string, courseCode: string): number {
  return db
    .select({ id: planEntries.id })
    .from(planEntries)
    .where(and(eq(planEntries.planId, planId), eq(planEntries.courseCode, courseCode)))
    .all().length;
}

/** Removes one entry of one plan; false when there was no such entry. */
export function removeEntry(planId: string, entryId: number): boolean {
  const removed = db
    .delete(planEntries)
    .where(and(eq(planEntries.planId, planId), eq(planEntries.id, entryId)))
    .returning({ id: planEntries.id })
    .all();
  return removed.length > 0;
}

/** Moves one entry of one plan to another session; false when there was no such entry. */
export function moveEntry(planId: string, entryId: number, session: string): boolean {
  const moved = db
    .update(planEntries)
    .set({ session })
    .where(and(eq(planEntries.planId, planId), eq(planEntries.id, entryId)))
    .returning({ id: planEntries.id })
    .all();
  return moved.length > 0;
}

/** Give a plan a new name; a blank one is ignored, the old name stays. */
export function renamePlan(planId: string, name: string): boolean {
  const trimmed = name.trim().slice(0, 80);
  if (!trimmed) return false;
  return db.update(plans).set({ name: trimmed }).where(eq(plans.id, planId)).run().changes > 0;
}

/** One more semester on the end of the plan. */
export function extendPlan(planId: string): void {
  db.update(plans)
    .set({ semesters: sql`${plans.semesters} + 1` })
    .where(eq(plans.id, planId))
    .run();
}

/** One more semester at the start of the plan: the courses stay in the
 *  sessions they're in, the plan just begins a session earlier. */
export function prependPlan(planId: string): void {
  const plan = getPlan(planId);
  if (!plan) return;
  db.update(plans)
    .set({ startSession: previousSession(plan.startSession), semesters: sql`${plans.semesters} + 1` })
    .where(eq(plans.id, planId))
    .run();
}
