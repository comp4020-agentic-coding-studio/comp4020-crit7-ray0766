import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { courses as courseData, program, specialisation } from "../data/mcomp-2026";
import type { Catalogue, CatalogueCourse, CatalogueRequirement } from "./catalogue";
import * as schema from "./schema";

type Db = BetterSQLite3Database<typeof schema>;

// Rebuild the reference tables from src/data/ — the transcript of Programs &
// Courses — so a corrected transcription reaches the deployed database on
// the next deploy without a migration. Courses are upserted and never
// deleted (plan entries point at them); the tables that hang off a course
// (offerings, requisite groups, requirement lines) are derived data, so
// they are cleared and rewritten each time. The whole thing is one
// transaction: a request never sees a half-rebuilt catalogue.
export function seedReferenceData(db: Db): void {
  db.transaction((tx) => {
    tx.insert(schema.programs)
      .values({
        code: program.code,
        name: program.name,
        totalUnits: program.totalUnits,
        sourceUrl: program.sourceUrl,
      })
      .onConflictDoUpdate({
        target: schema.programs.code,
        set: { name: program.name, totalUnits: program.totalUnits, sourceUrl: program.sourceUrl },
      })
      .run();

    tx.insert(schema.specialisations)
      .values({
        code: specialisation.code,
        programCode: specialisation.programCode,
        name: specialisation.name,
        units: specialisation.units,
        sourceUrl: specialisation.sourceUrl,
      })
      .onConflictDoUpdate({
        target: schema.specialisations.code,
        set: {
          programCode: specialisation.programCode,
          name: specialisation.name,
          units: specialisation.units,
          sourceUrl: specialisation.sourceUrl,
        },
      })
      .run();

    for (const c of courseData) {
      const row = {
        title: c.title,
        units: c.units,
        repeatable: c.repeatable ?? false,
        requisiteText: c.requisiteText,
        requisitesVerified: c.requisitesVerified,
        sourceUrl: c.sourceUrl,
      };
      tx.insert(schema.courses)
        .values({ code: c.code, ...row })
        .onConflictDoUpdate({ target: schema.courses.code, set: row })
        .run();
    }

    tx.delete(schema.offerings).run();
    tx.delete(schema.requisiteGroups).run(); // options go with them (cascade)
    tx.delete(schema.requirementGroups).run(); // members go with them (cascade)

    for (const c of courseData) {
      for (const semester of c.offerings) {
        tx.insert(schema.offerings).values({ courseCode: c.code, semester }).run();
      }
      for (const g of c.prereqs ?? []) {
        const group = tx
          .insert(schema.requisiteGroups)
          .values({ courseCode: c.code, kind: "prereq", concurrentOk: g.concurrentOk ?? false })
          .returning({ id: schema.requisiteGroups.id })
          .get();
        for (const courseCode of g.options) {
          tx.insert(schema.requisiteOptions).values({ groupId: group.id, courseCode }).run();
        }
      }
      if (c.incompatible?.length) {
        const group = tx
          .insert(schema.requisiteGroups)
          .values({ courseCode: c.code, kind: "incompatible", concurrentOk: false })
          .returning({ id: schema.requisiteGroups.id })
          .get();
        for (const courseCode of c.incompatible) {
          tx.insert(schema.requisiteOptions).values({ groupId: group.id, courseCode }).run();
        }
      }
    }

    const owners = [
      { ownerKind: "program" as const, ownerCode: program.code, lines: program.requirements },
      {
        ownerKind: "specialisation" as const,
        ownerCode: specialisation.code,
        lines: specialisation.requirements,
      },
    ];
    for (const { ownerKind, ownerCode, lines } of owners) {
      lines.forEach((r, ordinal) => {
        const group = tx
          .insert(schema.requirementGroups)
          .values({
            ownerKind,
            ownerCode,
            ordinal,
            label: r.label,
            kind: r.kind,
            units: r.units,
            level: r.level ?? null,
            subjects: r.subjects?.join(",") ?? null,
          })
          .returning({ id: schema.requirementGroups.id })
          .get();
        for (const courseCode of r.courses ?? []) {
          tx.insert(schema.requirementCourses).values({ groupId: group.id, courseCode }).run();
        }
      });
    }
  });
}

// The one plan the seed writes: a worked example the invariants can visit at
// /plan/demo, shaped like my own degree. Created once; after that it is user
// state like any other plan, so edits to it survive a redeploy.
export const DEMO_PLAN_ID = "demo";

const DEMO_ENTRIES: [string, string][] = [
  ["2026-S1", "COMP7710"],
  ["2026-S1", "MATH6005"],
  ["2026-S1", "COMP6442"],
  ["2026-S2", "COMP6390"],
  ["2026-S2", "COMP8020"],
  ["2026-S2", "COMP6261"],
  ["2026-S2", "COMP8280"],
  ["2027-S1", "COMP8715"],
  ["2027-S1", "COMP6528"],
  ["2027-S1", "COMP8610"],
  ["2027-S1", "COMP8350"],
  ["2027-S2", "COMP8715"],
  ["2027-S2", "COMP6120"],
  ["2027-S2", "COMP8430"],
  ["2027-S2", "COMP6670"],
];

export function seedDemoPlan(db: Db): void {
  const existing = db.select().from(schema.plans).where(eq(schema.plans.id, DEMO_PLAN_ID)).get();
  if (existing) return;
  db.transaction((tx) => {
    tx.insert(schema.plans)
      .values({
        id: DEMO_PLAN_ID,
        name: "Demo plan",
        programCode: program.code,
        specialisationCode: specialisation.code,
        startSession: "2026-S1",
        semesters: 4,
      })
      .run();
    for (const [session, courseCode] of DEMO_ENTRIES) {
      tx.insert(schema.planEntries).values({ planId: DEMO_PLAN_ID, courseCode, session }).run();
    }
  });
}

/** The reference tables, read back into the shape the rules and pages use. */
export function loadCatalogue(db: Db): Catalogue {
  const catalogue: Catalogue = {
    programs: new Map(),
    specialisations: new Map(),
    courses: new Map(),
    requirements: [],
  };

  for (const p of db.select().from(schema.programs).all()) catalogue.programs.set(p.code, p);
  for (const s of db.select().from(schema.specialisations).all()) {
    catalogue.specialisations.set(s.code, s);
  }

  const courses = new Map<string, CatalogueCourse>();
  for (const c of db.select().from(schema.courses).all()) {
    courses.set(c.code, { ...c, offerings: [], prereqs: [], incompatible: [] });
  }
  for (const o of db.select().from(schema.offerings).all()) {
    courses.get(o.courseCode)?.offerings.push(o.semester);
  }

  const options = new Map<number, string[]>();
  for (const o of db.select().from(schema.requisiteOptions).all()) {
    const list = options.get(o.groupId) ?? [];
    list.push(o.courseCode);
    options.set(o.groupId, list);
  }
  for (const g of db.select().from(schema.requisiteGroups).all()) {
    const course = courses.get(g.courseCode);
    if (!course) continue;
    const list = options.get(g.id) ?? [];
    if (g.kind === "prereq") course.prereqs.push({ options: list, concurrentOk: g.concurrentOk });
    else course.incompatible.push(...list);
  }
  catalogue.courses = courses;

  const members = new Map<number, string[]>();
  for (const m of db.select().from(schema.requirementCourses).all()) {
    const list = members.get(m.groupId) ?? [];
    list.push(m.courseCode);
    members.set(m.groupId, list);
  }
  for (const g of db.select().from(schema.requirementGroups).all()) {
    const line: CatalogueRequirement = {
      ownerKind: g.ownerKind,
      ownerCode: g.ownerCode,
      ordinal: g.ordinal,
      label: g.label,
      kind: g.kind,
      units: g.units ?? 0,
      courses: members.get(g.id) ?? [],
    };
    if (g.level !== null) line.level = g.level;
    if (g.subjects !== null) line.subjects = g.subjects.split(",");
    catalogue.requirements.push(line);
  }

  return catalogue;
}
