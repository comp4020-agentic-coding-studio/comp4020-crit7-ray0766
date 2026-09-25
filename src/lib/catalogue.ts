// The catalogue is the reference data in memory: what the rules and the
// pages read. It has no idea where it came from — src/lib/db.ts loads it from
// the reference tables after the boot seed, and the rules tests build a tiny
// one by hand — so the rules never touch the database.

import type { Semester } from "../data/mcomp-2026";

export type { Semester };

export interface CatalogueCourse {
  code: string;
  title: string;
  units: number;
  offerings: Semester[];
  repeatable: boolean;
  requisiteText: string;
  requisitesVerified: boolean;
  prereqs: { options: string[]; concurrentOk: boolean }[];
  incompatible: string[];
  sourceUrl: string;
}

export type RequirementKind = "all" | "min" | "max" | "level_min" | "elective";

export interface CatalogueRequirement {
  ownerKind: "program" | "specialisation";
  ownerCode: string;
  ordinal: number;
  label: string;
  kind: RequirementKind;
  units: number;
  level?: number;
  subjects?: string[];
  courses: string[];
}

export interface Catalogue {
  programs: Map<string, { code: string; name: string; totalUnits: number; sourceUrl: string }>;
  specialisations: Map<
    string,
    { code: string; programCode: string; name: string; units: number; sourceUrl: string }
  >;
  courses: Map<string, CatalogueCourse>;
  requirements: CatalogueRequirement[];
}

/** 'COMP' from 'COMP6442'. */
export function subjectOf(code: string): string {
  return code.slice(0, 4);
}

/** 6000 from 'COMP6442': the thousands digit of the number, as ANU counts levels. */
export function levelOf(code: string): number {
  return Math.floor(Number(code.slice(4)) / 1000) * 1000;
}

/** The requirement lines a plan is held to: its program's, then its specialisation's. */
export function requirementsFor(
  catalogue: Catalogue,
  programCode: string,
  specialisationCode: string | null,
): CatalogueRequirement[] {
  return catalogue.requirements
    .filter(
      (r) =>
        (r.ownerKind === "program" && r.ownerCode === programCode) ||
        (r.ownerKind === "specialisation" && r.ownerCode === specialisationCode),
    )
    .sort((a, b) =>
      a.ownerKind === b.ownerKind ? a.ordinal - b.ordinal : a.ownerKind === "program" ? -1 : 1,
    );
}
