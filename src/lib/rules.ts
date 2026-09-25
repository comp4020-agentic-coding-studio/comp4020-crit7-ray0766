// Every rule the planner applies, as pure functions over (catalogue, plan).
// Nothing here reads the database: the page loads a plan and its entries,
// hands them over, and renders what comes back. The rules tests build a
// small catalogue by hand and break each rule on purpose.
//
// The planner never refuses a placement. Each rule turns a placement ANUHub
// would bounce into an issue that says what ANUHub would say and why, and
// the progress lines say how much of the program the plan adds up to.

import {
  type Catalogue,
  type CatalogueCourse,
  type CatalogueRequirement,
  levelOf,
  requirementsFor,
  subjectOf,
} from "./catalogue";
import { labelSession, semesterOf } from "./sessions";

export const FULL_TIME_UNITS = 24;

export interface EntryLike {
  id: number;
  courseCode: string;
  session: string;
}

export interface PlanLike {
  programCode: string;
  specialisationCode: string | null;
  entries: EntryLike[];
}

export type IssueCode = "requisite" | "incompatible" | "not-offered" | "overload" | "unverified";

export interface Issue {
  code: IssueCode;
  severity: "error" | "warning";
  message: string;
  session: string;
  /** absent for a session-wide issue such as an overload */
  entryId?: number;
  courseCode?: string;
}

export interface Progress {
  label: string;
  kind: CatalogueRequirement["kind"];
  ownerKind: CatalogueRequirement["ownerKind"];
  /** the units the line asks for (or, for a max line, allows) */
  needed: number;
  /** the units the line counts from this plan, capped where the line caps */
  have: number;
  satisfied: boolean;
  /** the courses this line counted */
  courses: string[];
  /** 'all' lines only: what is still to place */
  missing: string[];
}

export interface Evaluation {
  issues: Issue[];
  progress: Progress[];
  totals: {
    /** every unit in the plan */
    units: number;
    /** the units the requirement lines counted */
    counted: number;
    /** the program's total */
    needed: number;
  };
}

const list = (codes: string[]): string => {
  if (codes.length <= 1) return codes.join("");
  return `${codes.slice(0, -1).join(", ")} or ${codes[codes.length - 1]}`;
};

export function evaluatePlan(catalogue: Catalogue, plan: PlanLike): Evaluation {
  const entries = [...plan.entries].sort(
    (a, b) => a.session.localeCompare(b.session) || a.id - b.id,
  );
  const bySession = new Map<string, EntryLike[]>();
  for (const e of entries) {
    const inSession = bySession.get(e.session) ?? [];
    inSession.push(e);
    bySession.set(e.session, inSession);
  }
  const placed = new Map(entries.map((e) => [e.courseCode, e]));
  const units = (code: string): number => catalogue.courses.get(code)?.units ?? 0;

  const issues: Issue[] = [];

  for (const e of entries) {
    const course = catalogue.courses.get(e.courseCode);
    if (!course) continue;
    issues.push(...requisiteIssues(course, e, placed));
    issues.push(...incompatibleIssues(course, e, placed));
    const offered = offeringIssue(course, e);
    if (offered) issues.push(offered);
  }

  for (const [session, inSession] of bySession) {
    const total = inSession.reduce((n, e) => n + units(e.courseCode), 0);
    if (total > FULL_TIME_UNITS) {
      issues.push({
        code: "overload",
        severity: "warning",
        session,
        message: `${total} units in ${labelSession(session)}: over the ${FULL_TIME_UNITS}-unit full-time load, so it needs an overload approval.`,
      });
    }
  }

  const requirements = requirementsFor(catalogue, plan.programCode, plan.specialisationCode);
  const progress = progressLines(catalogue, requirements, entries);

  const total = entries.reduce((n, e) => n + units(e.courseCode), 0);
  const counted = progress
    .filter((p) => p.kind !== "level_min")
    .reduce((n, p) => n + p.have, 0);
  const needed = catalogue.programs.get(plan.programCode)?.totalUnits ?? 0;

  return { issues, progress, totals: { units: total, counted, needed } };
}

// ----------------------------------------------------------------- rules

function requisiteIssues(
  course: CatalogueCourse,
  entry: EntryLike,
  placed: Map<string, EntryLike>,
): Issue[] {
  const base = { session: entry.session, entryId: entry.id, courseCode: course.code };

  if (!course.requisitesVerified) {
    return [
      {
        ...base,
        code: "unverified",
        severity: "warning",
        message:
          "Requisites not checked: the course page's line has a shape this planner can't model. Read it before you rely on this placement.",
      },
    ];
  }

  const issues: Issue[] = [];
  for (const group of course.prereqs) {
    const met = group.options.some((code) => {
      const other = placed.get(code);
      if (!other) return false;
      if (other.session < entry.session) return true;
      return group.concurrentOk && other.session === entry.session;
    });
    if (met) continue;

    // say why: an option that is in the plan, but too late, is the usual case
    const late = group.options
      .map((code) => placed.get(code))
      .filter((other): other is EntryLike => other !== undefined);
    let message: string;
    if (late.length === 0) {
      message = `Needs ${list(group.options)} before ${labelSession(entry.session)}; none is in this plan.`;
    } else {
      const other = late[0]!;
      message =
        other.session === entry.session
          ? `Needs ${other.courseCode} completed first, but it is in the same semester — ANUHub will want a permission code.`
          : `Needs ${other.courseCode} completed first, but it is in ${labelSession(other.session)}, after this.`;
    }
    issues.push({ ...base, code: "requisite", severity: "error", message });
  }
  return issues;
}

function incompatibleIssues(
  course: CatalogueCourse,
  entry: EntryLike,
  placed: Map<string, EntryLike>,
): Issue[] {
  const issues: Issue[] = [];
  for (const code of course.incompatible) {
    const other = placed.get(code);
    if (!other) continue;
    issues.push({
      code: "incompatible",
      severity: "error",
      session: entry.session,
      entryId: entry.id,
      courseCode: course.code,
      message: `Incompatible with ${code}, which is also in this plan (${labelSession(other.session)}).`,
    });
  }
  return issues;
}

function offeringIssue(course: CatalogueCourse, entry: EntryLike): Issue | undefined {
  const semester = semesterOf(entry.session);
  if (course.offerings.includes(semester)) return undefined;
  const base = {
    code: "not-offered" as const,
    severity: "error" as const,
    session: entry.session,
    entryId: entry.id,
    courseCode: course.code,
  };
  if (course.offerings.length === 0) {
    return { ...base, message: "No current offerings on Programs & Courses." };
  }
  const runs = course.offerings.map((s) => `Semester ${s.slice(1)}`).join(" and ");
  return {
    ...base,
    message: `Not offered in Semester ${semester.slice(1)}: the 2026 page lists ${runs} only.`,
  };
}

// -------------------------------------------------------------- progress

function progressLines(
  catalogue: Catalogue,
  requirements: CatalogueRequirement[],
  entries: EntryLike[],
): Progress[] {
  const units = (code: string): number => catalogue.courses.get(code)?.units ?? 0;
  const inPlan = new Set(entries.map((e) => e.courseCode));
  const order = new Map(entries.map((e, i) => [e.courseCode, i]));

  // courses named by any list line are that line's; everything else, plus
  // what overflows a min or max line, is the pool the elective lines draw on
  const listed = new Set(requirements.flatMap((r) => r.courses));
  const pool: string[] = entries.map((e) => e.courseCode).filter((code) => !listed.has(code));

  const blank = (r: CatalogueRequirement): Progress => ({
    label: r.label,
    kind: r.kind,
    ownerKind: r.ownerKind,
    needed: r.units,
    have: 0,
    satisfied: false,
    courses: [],
    missing: [],
  });
  const lines = new Map<CatalogueRequirement, Progress>();

  // first the lines that name courses, so their overflow is in the pool
  // before any elective line draws on it — whichever owner they belong to
  for (const r of requirements) {
    if (r.kind === "elective") continue;
    const line = blank(r);
    const present = r.courses
      .filter((code) => inPlan.has(code))
      .sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));

    switch (r.kind) {
      case "all": {
        line.courses = present;
        line.have = present.reduce((n, code) => n + units(code), 0);
        line.missing = r.courses.filter((code) => !inPlan.has(code));
        line.satisfied = line.missing.length === 0;
        break;
      }
      case "min": {
        // count courses in plan order until the minimum is met; the rest overflow
        for (const code of present) {
          if (line.have >= r.units) {
            pool.push(code);
            continue;
          }
          line.courses.push(code);
          line.have += units(code);
        }
        line.satisfied = line.have >= r.units;
        break;
      }
      case "max": {
        // count courses while they fit under the cap; the rest overflow
        for (const code of present) {
          if (line.have + units(code) > r.units) {
            pool.push(code);
            continue;
          }
          line.courses.push(code);
          line.have += units(code);
        }
        line.satisfied = true;
        break;
      }
      case "level_min": {
        line.courses = entries
          .map((e) => e.courseCode)
          .filter(
            (code) =>
              levelOf(code) >= (r.level ?? 0) &&
              (!r.subjects || r.subjects.includes(subjectOf(code))),
          );
        line.have = line.courses.reduce((n, code) => n + units(code), 0);
        line.satisfied = line.have >= r.units;
        break;
      }
    }
    lines.set(r, line);
  }

  // then the elective lines, in order, each taking what fits from the pool
  for (const r of requirements) {
    if (r.kind !== "elective") continue;
    const line = blank(r);
    for (const code of [...pool]) {
      if (line.have >= r.units) break;
      const eligible =
        levelOf(code) >= 6000 && (!r.subjects || r.subjects.includes(subjectOf(code)));
      if (!eligible) continue;
      pool.splice(pool.indexOf(code), 1);
      line.courses.push(code);
      line.have += units(code);
    }
    line.satisfied = line.have >= r.units;
    lines.set(r, line);
  }

  return requirements.map((r) => lines.get(r)!);
}
