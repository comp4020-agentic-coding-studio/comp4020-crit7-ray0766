import { describe, expect, it } from "vitest";
import type { Catalogue, CatalogueCourse, CatalogueRequirement } from "../src/lib/catalogue";
import { type EntryLike, evaluatePlan } from "../src/lib/rules";

// The rules, on a catalogue small enough to hold in your head. Each test is a
// sentinel that was seen red first — the rule it guards was broken on
// purpose and the test failed for that reason before it was allowed to pass.

const course = (
  code: string,
  overrides: Partial<CatalogueCourse> = {},
): [string, CatalogueCourse] => [
  code,
  {
    code,
    title: code,
    units: 6,
    offerings: ["S1", "S2"],
    repeatable: false,
    requisiteText: "",
    requisitesVerified: true,
    prereqs: [],
    incompatible: [],
    sourceUrl: `https://example.invalid/${code}`,
    ...overrides,
  },
];

const requirement = (
  overrides: Partial<CatalogueRequirement> & Pick<CatalogueRequirement, "kind" | "units">,
): CatalogueRequirement => ({
  ownerKind: "program",
  ownerCode: "TEST",
  ordinal: 0,
  label: overrides.kind,
  courses: [],
  ...overrides,
});

const catalogue: Catalogue = {
  programs: new Map([["TEST", { code: "TEST", name: "Test", totalUnits: 48, sourceUrl: "" }]]),
  specialisations: new Map(),
  courses: new Map([
    course("TEST1000"), // no requisites, runs both semesters
    course("TEST6100", { prereqs: [{ options: ["TEST1000", "TEST1001"], concurrentOk: false }] }),
    course("TEST6200", { prereqs: [{ options: ["TEST1000"], concurrentOk: true }] }),
    course("TEST6300", { incompatible: ["TEST1000"] }),
    course("TEST6400", { offerings: ["S1"] }),
    course("TEST6500", { offerings: [] }),
    course("TEST6600", { requisitesVerified: false, requisiteText: "complicated" }),
    course("TEST7000", { units: 12 }),
    course("TEST8100"),
    course("TEST8200"),
    course("MATH6000"),
  ]),
  requirements: [
    requirement({ ordinal: 0, kind: "all", units: 12, courses: ["TEST1000", "TEST6100"] }),
    requirement({ ordinal: 1, kind: "min", units: 6, courses: ["TEST6200", "TEST6300"] }),
    requirement({ ordinal: 2, kind: "max", units: 6, courses: ["TEST8100", "TEST8200"] }),
    requirement({ ordinal: 3, kind: "level_min", units: 12, level: 8000, subjects: ["TEST"] }),
    requirement({ ordinal: 4, kind: "elective", units: 12, subjects: ["TEST"] }),
    requirement({ ordinal: 5, kind: "elective", units: 6 }),
  ],
};

let nextId = 1;
const entry = (courseCode: string, session: string): EntryLike => ({
  id: nextId++,
  courseCode,
  session,
});
const plan = (...entries: EntryLike[]) => ({
  programCode: "TEST",
  specialisationCode: null,
  entries,
});
const issuesOf = (entries: EntryLike[], code?: string) =>
  evaluatePlan(catalogue, plan(...entries)).issues.filter((i) => !code || i.code === code);

describe("rules: requisites", () => {
  it("is quiet when a prerequisite sits in an earlier semester", () => {
    expect(issuesOf([entry("TEST1000", "2026-S1"), entry("TEST6100", "2026-S2")])).toEqual([]);
  });

  it("flags a prerequisite that is nowhere in the plan, naming the options", () => {
    const issues = issuesOf([entry("TEST6100", "2026-S2")], "requisite");
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe("error");
    expect(issues[0]?.message).toContain("TEST1000 or TEST1001");
    expect(issues[0]?.message).toContain("Semester 2, 2026");
  });

  it("flags a prerequisite in the same semester, and says a permission code is what ANUHub wants", () => {
    const issues = issuesOf(
      [entry("TEST1000", "2026-S2"), entry("TEST6100", "2026-S2")],
      "requisite",
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain("same semester");
    expect(issues[0]?.message).toContain("permission code");
  });

  it("flags a prerequisite placed after the course that needs it", () => {
    const issues = issuesOf(
      [entry("TEST6100", "2026-S1"), entry("TEST1000", "2026-S2")],
      "requisite",
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain("after this");
  });

  it("accepts the same semester when the page says 'completed or currently studying'", () => {
    expect(issuesOf([entry("TEST1000", "2026-S1"), entry("TEST6200", "2026-S1")])).toEqual([]);
  });

  it("warns, not errors, on a course whose requisites aren't modelled", () => {
    const issues = issuesOf([entry("TEST6600", "2026-S1")]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "unverified", severity: "warning" });
  });
});

describe("rules: incompatibility", () => {
  it("flags a course whose incompatible partner is anywhere in the plan", () => {
    const issues = issuesOf(
      [entry("TEST1000", "2026-S1"), entry("TEST6300", "2027-S2")],
      "incompatible",
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.courseCode).toBe("TEST6300");
    expect(issues[0]?.message).toContain("TEST1000");
  });

  it("is quiet when the partner is absent", () => {
    expect(issuesOf([entry("TEST6300", "2026-S1")], "incompatible")).toEqual([]);
  });
});

describe("rules: offerings", () => {
  it("flags a course put in a semester it doesn't run in, naming the one it does", () => {
    const issues = issuesOf([entry("TEST6400", "2026-S2")], "not-offered");
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain("Semester 1");
  });

  it("is quiet in a semester the course runs in", () => {
    expect(issuesOf([entry("TEST6400", "2027-S1")], "not-offered")).toEqual([]);
  });

  it("flags a course with no current offerings at all", () => {
    const issues = issuesOf([entry("TEST6500", "2026-S1")], "not-offered");
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain("No current offerings");
  });
});

describe("rules: load", () => {
  it("lets exactly 24 units through", () => {
    const s = "2026-S1";
    const entries = [
      entry("TEST7000", s),
      entry("TEST1000", s),
      entry("TEST8100", s),
    ]; // 12 + 6 + 6
    expect(issuesOf(entries, "overload")).toEqual([]);
  });

  it("warns once per semester over 24 units, with the number", () => {
    const s = "2026-S1";
    const entries = [
      entry("TEST7000", s),
      entry("TEST1000", s),
      entry("TEST8100", s),
      entry("TEST8200", s),
    ]; // 30
    const issues = issuesOf(entries, "overload");
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: "warning", session: s });
    expect(issues[0]?.entryId).toBeUndefined();
    expect(issues[0]?.message).toContain("30 units");
  });
});

describe("rules: progress", () => {
  const evaluate = (...entries: EntryLike[]) => evaluatePlan(catalogue, plan(...entries));
  const line = (evaluation: ReturnType<typeof evaluate>, kind: string, nth = 0) =>
    evaluation.progress.filter((p) => p.kind === kind)[nth]!;

  it("reports an empty plan as nothing met and nothing counted", () => {
    const e = evaluate();
    expect(e.progress.map((p) => p.satisfied)).toEqual([false, false, true, false, false, false]);
    expect(e.totals).toEqual({ units: 0, counted: 0, needed: 48 });
  });

  it("names what an 'all' line is still missing", () => {
    const e = evaluate(entry("TEST1000", "2026-S1"));
    expect(line(e, "all")).toMatchObject({ have: 6, needed: 12, satisfied: false, missing: ["TEST6100"] });
  });

  it("meets a 'min' line and lets the surplus flow to the electives", () => {
    const e = evaluate(entry("TEST6200", "2026-S1"), entry("TEST6300", "2026-S1"));
    expect(line(e, "min")).toMatchObject({ have: 6, satisfied: true, courses: ["TEST6200"] });
    expect(line(e, "elective", 0).courses).toEqual(["TEST6300"]);
  });

  it("caps a 'max' line and lets the surplus flow to the electives", () => {
    const e = evaluate(entry("TEST8100", "2026-S1"), entry("TEST8200", "2026-S2"));
    expect(line(e, "max")).toMatchObject({ have: 6, needed: 6, courses: ["TEST8100"] });
    expect(line(e, "elective", 0).courses).toEqual(["TEST8200"]);
  });

  it("counts units at a level across the whole plan", () => {
    const e = evaluate(entry("TEST8100", "2026-S1"), entry("TEST8200", "2026-S2"), entry("TEST1000", "2026-S1"));
    expect(line(e, "level_min")).toMatchObject({ have: 12, satisfied: true });
  });

  it("sends a course outside the elective's subjects to the open elective line", () => {
    const e = evaluate(entry("MATH6000", "2026-S1"));
    expect(line(e, "elective", 0).courses).toEqual([]);
    expect(line(e, "elective", 1)).toMatchObject({ have: 6, satisfied: true, courses: ["MATH6000"] });
  });

  it("adds up what the lines counted, not everything placed", () => {
    // 6 (all) + 6 (min) + 6 (max) + 6 (elective, from the min's surplus) + 0
    const e = evaluate(
      entry("TEST1000", "2026-S1"),
      entry("TEST6200", "2026-S1"),
      entry("TEST6300", "2026-S1"),
      entry("TEST8100", "2026-S2"),
    );
    expect(e.totals).toEqual({ units: 24, counted: 24, needed: 48 });
    // a fifth 8000-level course goes to the max line's surplus, then the electives
    const f = evaluate(
      entry("TEST1000", "2026-S1"),
      entry("TEST8100", "2026-S2"),
      entry("TEST8200", "2026-S2"),
    );
    expect(f.totals).toEqual({ units: 18, counted: 18, needed: 48 });
  });
});
