import type { APIRoute } from "astro";
import { program, specialisation } from "../../../data/mcomp-2026";
import { createPlan } from "../../../lib/db";
import { currentSession, isSession } from "../../../lib/sessions";

// Start a plan: a name and a first semester are all it takes, and both have
// defaults, so the form on the home page is one button. The new plan's URL
// is its identity — the 303 sends the browser there.
export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const name = String(form.get("name") ?? "")
    .trim()
    .slice(0, 80);
  const start = String(form.get("start") ?? "").trim() || currentSession(new Date());
  if (!isSession(start)) {
    return new Response("start must be a session like 2026-S1", { status: 400 });
  }
  const plan = createPlan({
    name: name || "My plan",
    programCode: program.code,
    specialisationCode: specialisation.code,
    startSession: start,
  });
  return redirect(`/plan/${plan.id}`, 303);
};
