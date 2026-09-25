import type { APIRoute } from "astro";
import { extendPlan, getPlan } from "../../../../lib/db";
import { bus } from "../../../../lib/events";

// One more semester on the end of the plan.
export const POST: APIRoute = ({ params, redirect }) => {
  const plan = params.id ? getPlan(params.id) : undefined;
  if (!plan) return new Response("No such plan", { status: 404 });

  extendPlan(plan.id);
  bus.emit("plan", { planId: plan.id, kind: "plan-extended" });
  return redirect(`/plan/${plan.id}`, 303);
};
