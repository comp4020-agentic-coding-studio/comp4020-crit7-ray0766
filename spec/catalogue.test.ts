import { describe, expect, it } from "vitest";
import { courses, program, specialisation } from "../src/data/mcomp-2026";

// The reference data is typed by hand from Programs & Courses, and a typo
// there is a lie the planner would repeat with confidence. These checks are
// the cheap net under that transcription: shapes, cross-references, and the
// arithmetic the program page itself states.

const CODE = /^[A-Z]{4}\d{4}$/;
const byCode = new Map(courses.map((c) => [c.code, c]));

describe("catalogue: courses", () => {
  it("has well-formed, unique codes and ANU unit sizes", () => {
    const seen = new Set<string>();
    for (const c of courses) {
      expect(c.code, c.code).toMatch(CODE);
      expect(seen.has(c.code), `${c.code} listed twice`).toBe(false);
      seen.add(c.code);
      expect([6, 12], `${c.code} units`).toContain(c.units);
      expect(c.title.trim()).not.toBe("");
    }
  });

  it("cites the 2026 course page it was read from", () => {
    for (const c of courses) {
      expect(c.sourceUrl).toBe(`https://programsandcourses.anu.edu.au/2026/course/${c.code}`);
    }
  });

  it("names only real semesters, once each", () => {
    for (const c of courses) {
      for (const s of c.offerings) expect(["S1", "S2"], `${c.code} offering`).toContain(s);
      expect(new Set(c.offerings).size).toBe(c.offerings.length);
    }
  });

  it("writes every requisite option and incompatibility as a course code", () => {
    for (const c of courses) {
      for (const g of c.prereqs ?? []) {
        expect(g.options.length, `${c.code} has an empty requisite group`).toBeGreaterThan(0);
        for (const o of g.options) expect(o, `${c.code} option`).toMatch(CODE);
      }
      for (const i of c.incompatible ?? []) expect(i, `${c.code} incompatible`).toMatch(CODE);
    }
  });

  it("keeps the requisite line for every course, and models it unless flagged", () => {
    for (const c of courses) {
      expect(c.requisiteText.trim(), `${c.code} has no requisite text`).not.toBe("");
      if (!c.requisitesVerified) {
        // an unverified course must not pretend to have prerequisites modelled
        expect(c.prereqs ?? [], `${c.code} is unverified yet has prereqs`).toEqual([]);
      }
    }
  });

  it("never lists a course as incompatible with itself or as its own prerequisite", () => {
    for (const c of courses) {
      expect(c.incompatible ?? []).not.toContain(c.code);
      for (const g of c.prereqs ?? []) expect(g.options).not.toContain(c.code);
    }
  });
});

describe("catalogue: requirements", () => {
  const owners = [
    { name: program.name, requirements: program.requirements, total: program.totalUnits },
    { name: specialisation.name, requirements: specialisation.requirements, total: specialisation.units },
  ];

  it("lists only courses the catalogue has", () => {
    for (const { name, requirements } of owners) {
      for (const r of requirements) {
        for (const code of r.courses ?? []) {
          expect(byCode.has(code), `${name}: ${r.label} names ${code}, not in the catalogue`).toBe(true);
        }
      }
    }
  });

  it("gives course lists to the kinds that count courses, and only to them", () => {
    for (const { requirements } of owners) {
      for (const r of requirements) {
        if (r.kind === "all" || r.kind === "min" || r.kind === "max") {
          expect(r.courses?.length ?? 0, r.label).toBeGreaterThan(0);
        } else {
          expect(r.courses, r.label).toBeUndefined();
        }
        if (r.kind === "level_min") expect(r.level, r.label).toBeTypeOf("number");
      }
    }
  });

  it("states an 'all' line's units as the sum of its courses", () => {
    for (const { requirements } of owners) {
      for (const r of requirements.filter((r) => r.kind === "all")) {
        const sum = (r.courses ?? []).reduce((n, code) => n + (byCode.get(code)?.units ?? 0), 0);
        expect(sum, r.label).toBe(r.units);
      }
    }
  });

  it("adds the Master of Computing's additive lines up to 96 units", () => {
    // level_min cuts across the others, so it is not part of the sum
    const additive = program.requirements.filter((r) => r.kind !== "level_min");
    const sum = additive.reduce((n, r) => n + r.units, 0) + specialisation.units;
    expect(sum).toBe(program.totalUnits);
  });

  it("adds the specialisation's lines up to 24 units", () => {
    const sum = specialisation.requirements.reduce((n, r) => n + r.units, 0);
    expect(sum).toBe(specialisation.units);
  });

  it("makes every 'min' line satisfiable from the courses it lists", () => {
    for (const { requirements } of owners) {
      for (const r of requirements.filter((r) => r.kind === "min")) {
        const available = (r.courses ?? []).reduce((n, code) => n + (byCode.get(code)?.units ?? 0), 0);
        expect(available, r.label).toBeGreaterThanOrEqual(r.units);
      }
    }
  });
});
