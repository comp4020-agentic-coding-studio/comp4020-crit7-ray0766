import type { APIRoute } from "astro";
import { addEntry, getCatalogue, getPlan, hasEntry } from "../../../../lib/db";
import { bus } from "../../../../lib/events";
import { planSessions } from "../../../../lib/sessions";

// Put a course into a semester of a plan. The only refusals are bad data: a
// plan that doesn't exist, a code the catalogue doesn't have, a session the
// plan doesn't cover. A real course is always taken — whether the placement
// is wise is the rules' business, and they say so on the page, not here.
export const POST: APIRoute = async ({ params, request, redirect }) => {
  const plan = params.id ? getPlan(params.id) : undefined;
  if (!plan) return new Response("No such plan", { status: 404 });

  const form = await request.formData();
  const course = String(form.get("course") ?? "")
    .trim()
    .toUpperCase();
  const session = String(form.get("session") ?? "").trim();

  if (!getCatalogue().courses.has(course)) {
    return new Response(`${course || "(blank)"} is not a course in the catalogue`, { status: 400 });
  }
  if (!planSessions(plan.startSession, plan.semesters).includes(session)) {
    return new Response(`${session || "(blank)"} is not a semester of this plan`, { status: 400 });
  }

  // already there: nothing to do, and nothing to apologise for
  if (hasEntry(plan.id, course)) {
    return redirect(`/plan/${plan.id}?already=${course}`, 303);
  }

  addEntry(plan.id, course, session);
  bus.emit("plan", { planId: plan.id, kind: "entry-added" });
  return redirect(`/plan/${plan.id}`, 303);
};
