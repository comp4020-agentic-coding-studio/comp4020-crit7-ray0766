import { JSDOM } from "jsdom";
import { beforeAll, describe, expect, inject, it } from "vitest";
import { currentSession } from "../src/lib/sessions";

// The planner's contract, driven over HTTP against the built server: a plan
// is created and lives at its URL; a course put into a semester is there on
// the next page load (spec line 3: the core flow persists across a reload);
// bad data is refused; a real course never is. The page is read the way a
// person reads it — which semester a course sits under — via the
// data-session / data-course attributes the plan page promises.
const baseUrl = inject("baseUrl");

// Astro checks form POSTs carry a same-origin Origin header (CSRF
// protection); browsers send it automatically, a bare fetch doesn't.
const post = (path: string, body: URLSearchParams) =>
  fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: { origin: baseUrl },
    body,
    redirect: "manual",
  });

const page = async (path: string): Promise<Document> => {
  const res = await fetch(new URL(path, baseUrl));
  expect(res.status, `GET ${path}`).toBe(200);
  return new JSDOM(await res.text()).window.document;
};

const entriesIn = (doc: Document, session: string): string[] =>
  [...doc.querySelectorAll(`[data-session="${session}"] [data-course]`)].map(
    (el) => el.getAttribute("data-course") ?? "",
  );

describe("plans", () => {
  let planPath: string; // '/plan/<id>'
  let planId: string;

  beforeAll(async () => {
    const res = await post(
      "/api/plans",
      new URLSearchParams({ name: "spec plan", start: "2026-S1" }),
    );
    expect(res.status).toBe(303);
    planPath = res.headers.get("location") ?? "";
    expect(planPath).toMatch(/^\/plan\/[A-Za-z0-9_-]{8}$/);
    planId = planPath.slice("/plan/".length);
  });

  it("serves the new plan with its four semesters, empty", async () => {
    const doc = await page(planPath);
    for (const session of ["2026-S1", "2026-S2", "2027-S1", "2027-S2"]) {
      expect(doc.querySelector(`[data-session="${session}"]`), session).not.toBeNull();
      expect(entriesIn(doc, session)).toEqual([]);
    }
    expect(doc.body.textContent).toContain("spec plan");
  });

  it("adds a course to a semester and redirects back to the plan", async () => {
    const res = await post(
      `/api/plans/${planId}/entries`,
      new URLSearchParams({ course: "COMP6390", session: "2026-S2" }),
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(planPath);
  });

  it("persists the course: a fresh page load shows it in that semester", async () => {
    const doc = await page(planPath);
    expect(entriesIn(doc, "2026-S2")).toEqual(["COMP6390"]);
    expect(entriesIn(doc, "2026-S1")).toEqual([]);
  });

  it("refuses a course code that is not in the catalogue", async () => {
    const res = await post(
      `/api/plans/${planId}/entries`,
      new URLSearchParams({ course: "COMP9999", session: "2026-S2" }),
    );
    expect(res.status).toBe(400);
  });

  it("refuses a session the plan doesn't cover", async () => {
    const res = await post(
      `/api/plans/${planId}/entries`,
      new URLSearchParams({ course: "COMP6442", session: "2031-S1" }),
    );
    expect(res.status).toBe(400);
  });

  it("keeps a repeat of a course out of the plan without calling it an error", async () => {
    const res = await post(
      `/api/plans/${planId}/entries`,
      new URLSearchParams({ course: "COMP6390", session: "2027-S1" }),
    );
    expect(res.status).toBe(303);
    const doc = await page(planPath);
    expect(entriesIn(doc, "2026-S2")).toEqual(["COMP6390"]);
    expect(entriesIn(doc, "2027-S1")).toEqual([]);
  });

  it("lets a course that is taken twice in twice, and no more", async () => {
    for (const session of ["2027-S1", "2027-S2", "2026-S1"]) {
      const res = await post(
        `/api/plans/${planId}/entries`,
        new URLSearchParams({ course: "COMP8715", session }),
      );
      expect(res.status, session).toBe(303);
    }
    const doc = await page(planPath);
    expect(entriesIn(doc, "2027-S1")).toEqual(["COMP8715"]);
    expect(entriesIn(doc, "2027-S2")).toEqual(["COMP8715"]);
    expect(entriesIn(doc, "2026-S1")).toEqual([]);
    expect(doc.querySelectorAll('[data-course="COMP8715"]')).toHaveLength(2);
  });

  it("never refuses a real course, whatever the rules will say about it", async () => {
    // COMP8020 needs COMP6390 completed first; the same semester is exactly
    // the placement ANUHub would bounce. The planner takes it and flags it.
    const res = await post(
      `/api/plans/${planId}/entries`,
      new URLSearchParams({ course: "COMP8020", session: "2026-S2" }),
    );
    expect(res.status).toBe(303);
    const doc = await page(planPath);
    expect(entriesIn(doc, "2026-S2")).toEqual(["COMP6390", "COMP8020"]);
  });

  it("removes a course through the form the page renders for it", async () => {
    const doc = await page(planPath);
    const form = doc.querySelector<HTMLFormElement>('[data-course="COMP8020"] form[action$="/delete"]');
    expect(form, "an entry carries its own remove form").not.toBeNull();
    const res = await post(form?.getAttribute("action") ?? "", new URLSearchParams());
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(planPath);
    expect(entriesIn(await page(planPath), "2026-S2")).toEqual(["COMP6390"]);
  });

  it("moves a course to another semester through the form the page renders for it", async () => {
    const doc = await page(planPath);
    const form = doc.querySelector<HTMLFormElement>('[data-course="COMP6390"] form[action$="/move"]');
    expect(form, "an entry carries its own move form").not.toBeNull();
    const res = await post(
      form?.getAttribute("action") ?? "",
      new URLSearchParams({ session: "2027-S1" }),
    );
    expect(res.status).toBe(303);
    const after = await page(planPath);
    expect(entriesIn(after, "2026-S2")).toEqual([]);
    expect(entriesIn(after, "2027-S1").sort()).toEqual(["COMP6390", "COMP8715"]);
    // and back, so the later tests see it where they expect
    await post(form?.getAttribute("action") ?? "", new URLSearchParams({ session: "2026-S2" }));
    expect(entriesIn(await page(planPath), "2026-S2")).toEqual(["COMP6390"]);
  });

  it("refuses to move a course to a semester the plan doesn't cover", async () => {
    const doc = await page(planPath);
    const form = doc.querySelector<HTMLFormElement>('[data-course="COMP6390"] form[action$="/move"]');
    const res = await post(form?.getAttribute("action") ?? "", new URLSearchParams({ session: "2031-S1" }));
    expect(res.status).toBe(400);
  });

  it("renames the plan through the form the page renders for it", async () => {
    const doc = await page(planPath);
    const form = doc.querySelector<HTMLFormElement>('form[action$="/rename"]');
    expect(form, "the page carries a rename form").not.toBeNull();
    const res = await post(form?.getAttribute("action") ?? "", new URLSearchParams({ name: "renamed plan" }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(planPath);
    const after = await page(planPath);
    expect(after.body.textContent).toContain("renamed plan");
    expect(after.querySelector('input[name="name"]')?.getAttribute("value")).toBe("renamed plan");
    // a blank name is not a name: the old one stays
    await post(form?.getAttribute("action") ?? "", new URLSearchParams({ name: "   " }));
    expect((await page(planPath)).body.textContent).toContain("renamed plan");
  });

  it("adds a semester on the end when asked", async () => {
    const res = await post(`/api/plans/${planId}/extend`, new URLSearchParams());
    expect(res.status).toBe(303);
    const doc = await page(planPath);
    expect(doc.querySelector('[data-session="2028-S1"]')).not.toBeNull();
  });

  it("adds a semester at the start when asked", async () => {
    const sessionsOf = (doc: Document): string[] =>
      [...doc.querySelectorAll("[data-session]")].map((el) => el.getAttribute("data-session") ?? "");
    const before = await page(planPath);
    const sessions = sessionsOf(before);
    expect(sessions[0]).toBe("2026-S1");
    const placed = sessions.map((s) => entriesIn(before, s));

    const res = await post(`/api/plans/${planId}/prepend`, new URLSearchParams());
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(planPath);

    const after = await page(planPath);
    expect(sessionsOf(after)).toEqual(["2025-S2", ...sessions]);
    expect(entriesIn(after, "2025-S2")).toEqual([]);
    // every semester that was there keeps its courses where they were
    expect(sessions.map((s) => entriesIn(after, s))).toEqual(placed);
  });

  it("answers 404 for a plan that doesn't exist", async () => {
    const res = await fetch(new URL("/plan/nope-nope", baseUrl));
    expect(res.status).toBe(404);
    const api = await post(
      "/api/plans/nope-nope/entries",
      new URLSearchParams({ course: "COMP6390", session: "2026-S2" }),
    );
    expect(api.status).toBe(404);
  });

  it("falls back to the current semester when the create form sends nothing", async () => {
    const res = await post("/api/plans", new URLSearchParams());
    expect(res.status).toBe(303);
    const doc = await page(res.headers.get("location") ?? "");
    const sessions = [...doc.querySelectorAll("[data-session]")].map((el) => el.getAttribute("data-session"));
    expect(sessions[0]).toBe(currentSession(new Date()));
    expect(sessions).toHaveLength(4);
  });
});

describe("front door", () => {
  it("is one button that starts a plan, and the way to the demo", async () => {
    const doc = await page("/");
    const forms = doc.querySelectorAll("form");
    expect(forms.length, "forms on the front door").toBe(1);
    const form = forms[0]!;
    expect(form.getAttribute("action")).toBe("/api/plans");
    expect(form.getAttribute("method")?.toLowerCase()).toBe("post");
    expect(form.querySelector('[name="name"]') === null, "no plan name to fill in").toBe(true);
    expect(form.querySelector('[name="start"]') === null, "no first semester to pick").toBe(true);
    expect(form.querySelectorAll("input, select, textarea").length, "fields in the form").toBe(0);
    expect(form.querySelectorAll("button").length, "buttons in the form").toBe(1);
    expect(doc.querySelector('a[href="/plan/demo"]'), "the demo plan is still one click away").not.toBeNull();
  });
});
