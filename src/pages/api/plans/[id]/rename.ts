import type { APIRoute } from "astro";
import { getPlan, renamePlan } from "../../../../lib/db";
import { bus } from "../../../../lib/events";

// Rename a plan from the name field in the top bar. A blank name is not a
// refusal worth a status code: the old name stays and the page comes back.
export const POST: APIRoute = async ({ params, request, redirect }) => {
  const plan = params.id ? getPlan(params.id) : undefined;
  if (!plan) return new Response("No such plan", { status: 404 });

  const form = await request.formData();
  if (renamePlan(plan.id, String(form.get("name") ?? ""))) {
    bus.emit("plan", { planId: plan.id, kind: "plan-renamed" });
  }
  return redirect(`/plan/${plan.id}`, 303);
};
