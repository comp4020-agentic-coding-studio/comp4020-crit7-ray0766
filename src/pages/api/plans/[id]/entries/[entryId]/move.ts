import type { APIRoute } from "astro";
import { getPlan, moveEntry } from "../../../../../../lib/db";
import { bus } from "../../../../../../lib/events";
import { planSessions } from "../../../../../../lib/sessions";

// Move a course to another semester of the same plan — the drop half of
// drag-and-drop, and the "Move to…" control for keyboards. Same rule as
// adding: the only refusal is a semester the plan doesn't cover.
export const POST: APIRoute = async ({ params, request, redirect }) => {
  const plan = params.id ? getPlan(params.id) : undefined;
  if (!plan) return new Response("No such plan", { status: 404 });

  const entryId = Number(params.entryId);
  if (!Number.isInteger(entryId)) return new Response("No such entry", { status: 404 });

  const form = await request.formData();
  const session = String(form.get("session") ?? "").trim();
  if (!planSessions(plan.startSession, plan.semesters).includes(session)) {
    return new Response(`${session || "(blank)"} is not a semester of this plan`, { status: 400 });
  }

  if (moveEntry(plan.id, entryId, session)) {
    bus.emit("plan", { planId: plan.id, kind: "entry-moved" });
  }
  return redirect(`/plan/${plan.id}`, 303);
};
