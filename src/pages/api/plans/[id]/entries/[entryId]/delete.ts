import type { APIRoute } from "astro";
import { getPlan, removeEntry } from "../../../../../../lib/db";
import { bus } from "../../../../../../lib/events";

// Take a course out of a plan. A plain form POST, because a browser form can't
// send DELETE; the entry id in the path is the one the plan page rendered.
export const POST: APIRoute = ({ params, redirect }) => {
  const plan = params.id ? getPlan(params.id) : undefined;
  if (!plan) return new Response("No such plan", { status: 404 });

  const entryId = Number(params.entryId);
  if (!Number.isInteger(entryId)) return new Response("No such entry", { status: 404 });

  if (removeEntry(plan.id, entryId)) {
    bus.emit("plan", { planId: plan.id, kind: "entry-removed" });
  }
  return redirect(`/plan/${plan.id}`, 303);
};
