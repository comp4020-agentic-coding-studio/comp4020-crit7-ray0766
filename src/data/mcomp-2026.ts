// The reference data: a transcript of Programs & Courses 2026 for the slice
// this planner models — the Master of Computing, its Human-Centred and
// Creative Computing specialisation, and the courses those two name plus the
// electives I actually deal with. Every entry carries the URL it was read
// from. Nothing here is invented: where a course page says nothing, the field
// says nothing, and `requisitesVerified: false` marks a course whose
// requisite line the OR/AND model can't carry, so the planner says "not
// checked" for it instead of passing it.
//
// Two stated assumptions, both surfaced on the page: a course's offering
// pattern (S1, S2 or both) is the 2026 page's and is assumed to repeat in
// later years; and requisites that are about the program a student is in
// ("must be enrolled in the Master of Computing") are taken as met, because
// every plan here is a Master of Computing plan.
//
// This file feeds src/lib/seed.ts, which rebuilds the reference tables from
// it at every boot. It is data, not code: keep it that way.

export type Semester = "S1" | "S2";

export interface PrereqGroup {
  /** any one of these satisfies the group */
  options: string[];
  /** "completed or currently studying": the same session counts */
  concurrentOk?: boolean;
}

export interface CourseData {
  code: string;
  title: string;
  units: number;
  /** which halves of the year the 2026 page lists; empty = "no current offerings" */
  offerings: Semester[];
  /** COMP8715 is taken twice */
  repeatable?: boolean;
  /** the requisite line, condensed from the page; the groups below are its machine form */
  requisiteText: string;
  /** false when the line above can't be carried by prereqs/incompatible below */
  requisitesVerified: boolean;
  /** AND of OR-groups; a group's option may name a course outside this catalogue */
  prereqs?: PrereqGroup[];
  /** any of these anywhere in the plan is a clash */
  incompatible?: string[];
  sourceUrl: string;
}

export type RequirementKind = "all" | "min" | "max" | "level_min" | "elective";

export interface RequirementData {
  label: string;
  kind: RequirementKind;
  /** the units the line asks for (min/max/level_min/elective) or adds up to (all) */
  units: number;
  /** level_min only: the level, e.g. 8000 */
  level?: number;
  /** level_min/elective: the subject areas that count, e.g. ["COMP", "ENGN"]; omitted = any */
  subjects?: string[];
  /** all/min/max: the listed courses */
  courses?: string[];
}

export interface ProgramData {
  code: string;
  name: string;
  totalUnits: number;
  sourceUrl: string;
  requirements: RequirementData[];
}

export interface SpecialisationData {
  code: string;
  programCode: string;
  name: string;
  units: number;
  sourceUrl: string;
  requirements: RequirementData[];
}

const course = (code: string): string => `https://programsandcourses.anu.edu.au/2026/course/${code}`;

// https://programsandcourses.anu.edu.au/2026/program/7706xmcomp
export const program: ProgramData = {
  code: "MCOMP",
  name: "Master of Computing",
  totalUnits: 96,
  sourceUrl: "https://programsandcourses.anu.edu.au/2026/program/7706xmcomp",
  requirements: [
    {
      label: "30 units from completion of the compulsory courses",
      kind: "all",
      units: 30,
      courses: ["COMP6120", "COMP6442", "COMP7710", "COMP8280"],
    },
    {
      label: "A minimum of 6 units from the foundation courses",
      kind: "min",
      units: 6,
      courses: ["MATH6005", "COMP6260"],
    },
    {
      label: "A maximum of 12 units from the capstone courses",
      kind: "max",
      units: 12,
      courses: ["COMP8715", "COMP8830"],
    },
    {
      label: "A minimum of 24 units of 8000-level COMP courses",
      kind: "level_min",
      units: 24,
      level: 8000,
      subjects: ["COMP"],
    },
    {
      label: "18 units from further 6000, 7000 or 8000 level COMP or ENGN courses",
      kind: "elective",
      units: 18,
      subjects: ["COMP", "ENGN"],
    },
    {
      label: "6 units from elective courses offered by ANU",
      kind: "elective",
      units: 6,
    },
  ],
};

// https://programsandcourses.anu.edu.au/2026/specialisation/HCCM-SPEC
export const specialisation: SpecialisationData = {
  code: "HCCM",
  programCode: "MCOMP",
  name: "Human-Centred and Creative Computing",
  units: 24,
  sourceUrl: "https://programsandcourses.anu.edu.au/2026/specialisation/HCCM-SPEC",
  requirements: [
    {
      label: "6 units from completion of COMP6390 Human-Computer Interaction",
      kind: "all",
      units: 6,
      courses: ["COMP6390"],
    },
    {
      label: "A minimum of 12 units from the specialisation's 8000-level courses",
      kind: "min",
      units: 12,
      courses: ["COMP8350", "COMP8539", "COMP8610"],
    },
    {
      label: "A maximum of 6 units from the specialisation's 6000-level courses",
      kind: "max",
      units: 6,
      courses: ["COMP6528", "COMP6540", "COMP6720", "COMP6780"],
    },
  ],
};

export const courses: CourseData[] = [
  // ------------------------------------------------------------ compulsory
  {
    code: "COMP6120",
    title: "Software Engineering",
    units: 6,
    offerings: ["S2"],
    requisiteText:
      "Completed or currently studying COMP6442 or COMP2100. Incompatible with COMP2120.",
    requisitesVerified: true,
    prereqs: [{ options: ["COMP6442", "COMP2100"], concurrentOk: true }],
    incompatible: ["COMP2120"],
    sourceUrl: course("COMP6120"),
  },
  {
    code: "COMP6442",
    title: "Software Construction",
    units: 6,
    offerings: ["S1", "S2"],
    requisiteText:
      "Completed (COMP6710 or COMP7710 or COMP1110 or COMP1140) and completed or currently studying (MATH6005 or COMP6260 or MATH1005 or COMP1600); other paths for MMLCV and Master of Computing (Advanced) students. Incompatible with COMP2100.",
    requisitesVerified: true,
    prereqs: [
      { options: ["COMP6710", "COMP7710", "COMP1110", "COMP1140"] },
      { options: ["MATH6005", "COMP6260", "MATH1005", "COMP1600"], concurrentOk: true },
    ],
    incompatible: ["COMP2100"],
    sourceUrl: course("COMP6442"),
  },
  {
    code: "COMP7710",
    title: "Programming Fundamentals",
    units: 12,
    offerings: ["S1", "S2"],
    requisiteText:
      "Not available if you have completed or are enrolled in COMP1110, COMP1140 or COMP6710. A permission code from the School of Computing is needed to enrol.",
    requisitesVerified: true,
    incompatible: ["COMP1110", "COMP1140", "COMP6710"],
    sourceUrl: course("COMP7710"),
  },
  {
    code: "COMP8280",
    title: "Responsible Practice, Innovation and Leadership",
    units: 6,
    offerings: ["S1", "S2"],
    requisiteText:
      "Must be enrolled in the Graduate Diploma of Computing, Master of Computing, Master of Computing (Advanced) or MMLCV. Incompatible with COMP8260, ENGN8260 and ENGN8280.",
    requisitesVerified: true,
    incompatible: ["COMP8260", "ENGN8260", "ENGN8280"],
    sourceUrl: course("COMP8280"),
  },
  // ------------------------------------------------------------ foundation
  {
    code: "MATH6005",
    title: "Discrete Mathematical Models",
    units: 6,
    offerings: ["S1"],
    requisiteText:
      "CECS students must be enrolled in a Graduate Diploma of Computing or a Master of Computing. Incompatible with MATH1005.",
    requisitesVerified: true,
    incompatible: ["MATH1005"],
    sourceUrl: course("MATH6005"),
  },
  {
    code: "COMP6260",
    title: "Foundations of Computing",
    units: 6,
    offerings: ["S2"],
    requisiteText: "Incompatible with COMP1600.",
    requisitesVerified: true,
    incompatible: ["COMP1600"],
    sourceUrl: course("COMP6260"),
  },
  // -------------------------------------------------------------- capstone
  {
    code: "COMP8715",
    title: "Advanced Computing Team Project",
    units: 6,
    offerings: ["S1", "S2"],
    repeatable: true,
    requisiteText:
      "Master of Computing: completed (COMP6442 or COMP2100) and (COMP8260 or COMP8280); MMLCV: completed (COMP6442 or COMP2100) and (COMP6250 or COMP8260 or COMP8280). Incompatible with COMP8755, COMP8830 and COMP8800. Taken twice, in consecutive semesters.",
    requisitesVerified: true,
    prereqs: [{ options: ["COMP6442", "COMP2100"] }, { options: ["COMP8260", "COMP8280"] }],
    incompatible: ["COMP8755", "COMP8830", "COMP8800"],
    sourceUrl: course("COMP8715"),
  },
  {
    code: "COMP8830",
    title: "Computing Internship",
    units: 12,
    offerings: ["S1", "S2"],
    requisiteText:
      "Master of Computing: completed COMP8260 and COMP6442; MMLCV: completed COMP6710 and (COMP6250 or COMP8260). Incompatible with COMP8715, COMP8755 and COMP8800. Competitive entry; a permission code is needed.",
    requisitesVerified: true,
    // the page still names COMP8260, which COMP8280 replaced — so a Master
    // of Computing plan can never satisfy this line as written
    prereqs: [{ options: ["COMP8260"] }, { options: ["COMP6442"] }],
    incompatible: ["COMP8715", "COMP8755", "COMP8800"],
    sourceUrl: course("COMP8830"),
  },
  // ------------------------------------- Human-Centred and Creative Computing
  {
    code: "COMP6390",
    title: "Human-Computer Interaction",
    units: 6,
    offerings: ["S2"],
    requisiteText:
      "Must be studying the Master of Computing or Master of Computing (Advanced), or have completed 6 units of COMP6442, COMP6710 or COMP6720. Incompatible with COMP3900.",
    requisitesVerified: true,
    incompatible: ["COMP3900"],
    sourceUrl: course("COMP6390"),
  },
  {
    code: "COMP8350",
    title: "Sound and Music Computing",
    units: 6,
    // no 2026 class; the page lists First Semester in 2027 and 2028
    offerings: ["S1"],
    requisiteText: "Completed COMP6390 or COMP6720. Incompatible with COMP4350.",
    requisitesVerified: true,
    prereqs: [{ options: ["COMP6390", "COMP6720"] }],
    incompatible: ["COMP4350"],
    sourceUrl: course("COMP8350"),
  },
  {
    code: "COMP8539",
    title: "Advanced Topics in Computer Vision",
    units: 6,
    offerings: [],
    requisiteText:
      "Completed COMP6528, COMP4528 or ENGN4528. Not available if you have completed ENGN8501. No current offerings.",
    requisitesVerified: true,
    prereqs: [{ options: ["COMP6528", "COMP4528", "ENGN4528"] }],
    incompatible: ["ENGN8501"],
    sourceUrl: course("COMP8539"),
  },
  {
    code: "COMP8610",
    title: "Computer Graphics",
    units: 6,
    offerings: ["S1"],
    requisiteText:
      "Completed (COMP6710 or COMP1110 or COMP1140) and completed (COMP6390 or COMP6442 or COMP6540 or COMP6780 or COMP6720); other paths for VCOMP and MMLCV students. Not available if you have completed COMP4610 or COMP6461.",
    requisitesVerified: true,
    prereqs: [
      { options: ["COMP6710", "COMP1110", "COMP1140"] },
      { options: ["COMP6390", "COMP6442", "COMP6540", "COMP6780", "COMP6720"] },
    ],
    incompatible: ["COMP4610", "COMP6461"],
    sourceUrl: course("COMP8610"),
  },
  {
    code: "COMP6528",
    title: "Computer Vision",
    units: 6,
    offerings: ["S1"],
    requisiteText:
      "Must be studying the Graduate Diploma of Computing, Master of Computing, Master of Computing (Advanced) or MMLCV. Incompatible with ENGN6528, COMP4528 and ENGN4528.",
    requisitesVerified: true,
    incompatible: ["ENGN6528", "COMP4528", "ENGN4528"],
    sourceUrl: course("COMP6528"),
  },
  {
    code: "COMP6540",
    title: "Game Development",
    units: 6,
    offerings: [],
    requisiteText:
      "Must be enrolled in the Master of Computing (Advanced), or have completed COMP6710, COMP1110 or COMP1140. No current offerings.",
    requisitesVerified: true,
    prereqs: [{ options: ["COMP6710", "COMP1110", "COMP1140"] }],
    sourceUrl: course("COMP6540"),
  },
  {
    code: "COMP6720",
    title: "Art and Interaction Computing",
    units: 6,
    offerings: [],
    requisiteText: "Incompatible with COMP1720. No current offerings.",
    requisitesVerified: true,
    incompatible: ["COMP1720"],
    sourceUrl: course("COMP6720"),
  },
  {
    code: "COMP6780",
    title: "Web Development and Design",
    units: 6,
    offerings: [],
    requisiteText:
      "Must be enrolled in a postgraduate program at ANU. Incompatible with COMP1710. No current offerings.",
    requisitesVerified: true,
    incompatible: ["COMP1710"],
    sourceUrl: course("COMP6780"),
  },
  // -------------------------------------------------------------- electives
  {
    code: "COMP8020",
    title: "Advanced Topics in Human-Centred and Creative Computing",
    units: 6,
    offerings: ["S2"],
    requisiteText:
      "Completed COMP6390. Further prerequisites for the specific topic are announced by the School of Computing; students who meet them can request a permission code.",
    requisitesVerified: true,
    prereqs: [{ options: ["COMP6390"] }],
    sourceUrl: course("COMP8020"),
  },
  {
    code: "COMP6261",
    title: "Information Theory",
    units: 6,
    offerings: ["S2"],
    requisiteText: "Not available if you have completed COMP2610 or ENGN8534.",
    requisitesVerified: true,
    incompatible: ["COMP2610", "ENGN8534"],
    sourceUrl: course("COMP6261"),
  },
  {
    code: "COMP6710",
    title: "Structured Programming",
    units: 6,
    offerings: ["S1", "S2"],
    requisiteText:
      "Not available to Master of Computing (Advanced) students. Incompatible with COMP1110, COMP1140 and COMP7710.",
    requisitesVerified: true,
    incompatible: ["COMP1110", "COMP1140", "COMP7710"],
    sourceUrl: course("COMP6710"),
  },
  {
    code: "COMP6240",
    title: "Relational Databases",
    units: 6,
    offerings: ["S1", "S2"],
    requisiteText:
      "Not available if you have completed COMP2400. Incompatible with COMP7240.",
    requisitesVerified: true,
    incompatible: ["COMP2400", "COMP7240"],
    sourceUrl: course("COMP6240"),
  },
  {
    code: "COMP6670",
    title: "Introduction to Machine Learning",
    units: 6,
    offerings: ["S2"],
    requisiteText:
      "Master of Computing (Advanced) students, or completed or currently studying (COMP6710 or COMP7710 or COMP6730), or completed COMP1110 or COMP1140. Incompatible with COMP3670.",
    requisitesVerified: true,
    prereqs: [
      { options: ["COMP6710", "COMP7710", "COMP6730", "COMP1110", "COMP1140"], concurrentOk: true },
    ],
    incompatible: ["COMP3670"],
    sourceUrl: course("COMP6670"),
  },
  {
    code: "COMP8410",
    title: "Data Mining",
    units: 6,
    offerings: ["S1"],
    requisiteText:
      "Completed (COMP7240 or COMP6240 or COMP2400) and (COMP6730 or COMP7230 or COMP6710). Incompatible with COMP3420, COMP3425, COMP8400 and COMP8910.",
    requisitesVerified: true,
    prereqs: [
      { options: ["COMP7240", "COMP6240", "COMP2400"] },
      { options: ["COMP6730", "COMP7230", "COMP6710"] },
    ],
    incompatible: ["COMP3420", "COMP3425", "COMP8400", "COMP8910"],
    sourceUrl: course("COMP8410"),
  },
  {
    code: "COMP8430",
    title: "Data Wrangling",
    units: 6,
    offerings: ["S2"],
    requisiteText:
      "Completed (COMP7230 or COMP6730 or COMP6710) and (COMP7240 or COMP6240). Incompatible with COMP3430. A permission code is needed for the intensive mode.",
    requisitesVerified: true,
    prereqs: [
      { options: ["COMP7230", "COMP6730", "COMP6710"] },
      { options: ["COMP7240", "COMP6240"] },
    ],
    incompatible: ["COMP3430"],
    sourceUrl: course("COMP8430"),
  },
  {
    code: "COMP8600",
    title: "Statistical Machine Learning",
    units: 6,
    offerings: ["S1"],
    requisiteText:
      "Completed COMP6670 or COMP3670, or ((COMP6710 or COMP6730 or COMP7230 or COMP1110 or COMP1730) and (COMP8410 or COMP8910 or COMP3425) and (STAT6039 or STAT7039)). Incompatible with COMP4670 and COMP8960.",
    // an OR of two paths, one of which is itself an AND: not a shape the
    // OR-groups-joined-by-AND model can hold, so the planner says "not checked"
    requisitesVerified: false,
    incompatible: ["COMP4670", "COMP8960"],
    sourceUrl: course("COMP8600"),
  },
];
