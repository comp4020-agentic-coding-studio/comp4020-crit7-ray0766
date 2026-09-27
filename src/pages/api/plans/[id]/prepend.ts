import type { APIRoute } from "astro";
import { getPlan, prependPlan } from "../../../../lib/db";
import { bus } from "../../../../lib/events";

// One more semester at the start of the plan.
export const POST: APIRoute = ({ params, redirect }) => {
  const plan = params.id ? getPlan(params.id) : undefined;
  if (!plan) return new Response("No such plan", { status: 404 });

  prependPlan(plan.id);
  bus.emit("plan", { planId: plan.id, kind: "plan-prepended" });
  return redirect(`/plan/${plan.id}`, 303);
};
