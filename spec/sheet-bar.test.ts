import { JSDOM } from "jsdom";
import { expect, inject, it } from "vitest";

// On a phone the requirements are folded into a bar at the foot of the page,
// and that bar is all of the tally a person sees until they open it. It has to
// say what the side panel says: the bounces and the warnings, not only the
// first half.
const baseUrl = inject("baseUrl");

const post = (path: string, body: URLSearchParams) =>
  fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: { origin: baseUrl },
    body,
    redirect: "manual",
  });

it("names the warnings in the folded requirements bar", async () => {
  const res = await post("/api/plans", new URLSearchParams({ name: "bar plan", start: "2026-S1" }));
  const planPath = res.headers.get("location") ?? "";
  // COMP8600 runs in S1 and its requisite line isn't modelled: one warning,
  // nothing ANUHub would bounce
  await post(
    `${planPath.replace("/plan/", "/api/plans/")}/entries`,
    new URLSearchParams({ course: "COMP8600", session: "2026-S1" }),
  );
  const doc = new JSDOM(await (await fetch(new URL(planPath, baseUrl))).text()).window.document;
  expect(doc.querySelector(".sheet-bar")?.textContent).toContain("1 warning");
});
