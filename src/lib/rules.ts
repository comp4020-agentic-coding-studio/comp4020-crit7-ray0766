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

export const ISSUE_TITLES: Record<IssueCode, string> = {
  requisite: "Requisite not met.",
  incompatible: "Incompatible.",
  "not-offered": "Not offered.",
  overload: "Over the full-time load.",
  unverified: "Not checked.",
};

export interface Issue {
  code: IssueCode;
  severity: "error" | "warning";
  /** the full sentence, in ANUHub's terms */
  message: string;
  /** a few words for the card itself; the sentence is a hover or a list away */
  short: string;
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

/** Which kind of requirement a placed course is counting towards — the
 *  colour a course card carries. */
export type Category =
  | "compulsory"
  | "foundation"
  | "capstone"
  | "specialisation-core"
  | "specialisation-elective"
  | "elective"
  | "uncounted";

export const CATEGORY_LABELS: Record<Category, string> = {
  compulsory: "Compulsory",
  foundation: "Foundation",
  capstone: "Capstone",
  "specialisation-core": "Specialisation core",
  "specialisation-elective": "Specialisation elective",
  elective: "Elective",
  uncounted: "Doesn't count",
};

export interface Evaluation {
  issues: Issue[];
  progress: Progress[];
  /** course code → the category of the line that counted it */
  categories: Map<string, Category>;
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
        short: `${total} units: needs an overload approval`,
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

  return {
    issues,
    progress,
    categories: categorise(progress, entries),
    totals: { units: total, counted, needed },
  };
}

/** The category a requirement line's courses carry; the level line counts
 *  across the others and has none. */
export function lineCategory(
  line: Pick<CatalogueRequirement, "kind" | "ownerKind">,
): Category | undefined {
  if (line.kind === "level_min") return undefined;
  if (line.ownerKind === "specialisation") {
    return line.kind === "max" ? "specialisation-elective" : "specialisation-core";
  }
  if (line.kind === "all") return "compulsory";
  if (line.kind === "min") return "foundation";
  if (line.kind === "max") return "capstone";
  return "elective";
}

// A course takes the category of the first line that counted it, in the
// order the lines are shown, skipping the level line (which counts across
// the others). Anything no line counted doesn't count towards the program.
function categorise(progress: Progress[], entries: EntryLike[]): Map<string, Category> {
  const categories = new Map<string, Category>();
  for (const p of progress) {
    const category = lineCategory(p);
    if (!category) continue;
    for (const code of p.courses) {
      if (!categories.has(code)) categories.set(code, category);
    }
  }
  for (const e of entries) {
    if (!categories.has(e.courseCode)) categories.set(e.courseCode, "uncounted");
  }
  return categories;
}

/** What a course would count as if it were placed: the first line that names
 *  it, else the elective pool. Whether it actually counts once placed is
 *  `evaluatePlan`'s answer — a line can be full — so this is the colour the
 *  search dialog shows before a placement exists, nothing more. */
export function nominalCategory(
  catalogue: Catalogue,
  plan: Pick<PlanLike, "programCode" | "specialisationCode">,
  code: string,
): Category {
  for (const r of requirementsFor(catalogue, plan.programCode, plan.specialisationCode)) {
    const category = lineCategory(r);
    if (category && r.courses.includes(code)) return category;
  }
  return "elective";
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
        short: "requisites not checked",
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
    let short: string;
    if (late.length === 0) {
      message = `Needs ${list(group.options)} before ${labelSession(entry.session)}; none is in this plan.`;
      short = "requisite not in plan";
    } else {
      const other = late[0]!;
      message =
        other.session === entry.session
          ? `Needs ${other.courseCode} completed first, but it is in the same semester — ANUHub will want a permission code.`
          : `Needs ${other.courseCode} completed first, but it is in ${labelSession(other.session)}, after this.`;
      short = `needs ${other.courseCode} first`;
    }
    issues.push({ ...base, code: "requisite", severity: "error", short, message });
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
      short: `incompatible with ${code}`,
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
    return { ...base, short: "no current offerings", message: "No current offerings on Programs & Courses." };
  }
  const runs = course.offerings.map((s) => `Semester ${s.slice(1)}`).join(" and ");
  return {
    ...base,
    short: `not offered in Semester ${semester.slice(1)}`,
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

  // every entry counts separately — a repeated course is two placements —
  // and courses named by any list line are that line's; everything else,
  // plus what overflows a min or max line, is the pool the elective lines
  // draw on
  const listed = new Set(requirements.flatMap((r) => r.courses));
  const pool: EntryLike[] = entries.filter((e) => !listed.has(e.courseCode));

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
    const present = entries.filter((e) => r.courses.includes(e.courseCode));

    switch (r.kind) {
      case "all": {
        line.courses = present.map((e) => e.courseCode);
        line.have = present.reduce((n, e) => n + units(e.courseCode), 0);
        line.missing = r.courses.filter((code) => !inPlan.has(code));
        line.satisfied = line.missing.length === 0;
        break;
      }
      case "min": {
        // count placements in plan order until the minimum is met; the rest overflow
        for (const e of present) {
          if (line.have >= r.units) {
            pool.push(e);
            continue;
          }
          line.courses.push(e.courseCode);
          line.have += units(e.courseCode);
        }
        line.satisfied = line.have >= r.units;
        break;
      }
      case "max": {
        // count placements while they fit under the cap; the rest overflow
        for (const e of present) {
          if (line.have + units(e.courseCode) > r.units) {
            pool.push(e);
            continue;
          }
          line.courses.push(e.courseCode);
          line.have += units(e.courseCode);
        }
        line.satisfied = true;
        break;
      }
      case "level_min": {
        const counted = entries.filter(
          (e) =>
            levelOf(e.courseCode) >= (r.level ?? 0) &&
            (!r.subjects || r.subjects.includes(subjectOf(e.courseCode))),
        );
        line.courses = counted.map((e) => e.courseCode);
        line.have = counted.reduce((n, e) => n + units(e.courseCode), 0);
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
    for (const e of [...pool]) {
      if (line.have >= r.units) break;
      const eligible =
        levelOf(e.courseCode) >= 6000 &&
        (!r.subjects || r.subjects.includes(subjectOf(e.courseCode)));
      if (!eligible) continue;
      pool.splice(pool.indexOf(e), 1);
      line.courses.push(e.courseCode);
      line.have += units(e.courseCode);
    }
    line.satisfied = line.have >= r.units;
    lines.set(r, line);
  }

  return requirements.map((r) => lines.get(r)!);
}
