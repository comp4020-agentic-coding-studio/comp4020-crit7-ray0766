import { beforeAll, describe, expect, inject, it } from "vitest";

// The live channel: a change to a plan reaches every other client over the
// SSE stream, so the same plan open on a phone and a laptop stays in step.
// Driven over HTTP against the built server, like the rest of the contract.
const baseUrl = inject("baseUrl");

const post = (path: string, body: URLSearchParams) =>
  fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: { origin: baseUrl },
    body,
    redirect: "manual",
  });

describe("plan stream", () => {
  let planId: string;

  beforeAll(async () => {
    const res = await post("/api/plans", new URLSearchParams({ name: "stream probe" }));
    planId = (res.headers.get("location") ?? "").slice("/plan/".length);
    expect(planId).not.toBe("");
  });

  it("opens as an event stream and speaks first", async () => {
    const stream = await fetch(new URL("/api/events", baseUrl));
    expect(stream.headers.get("content-type")).toContain("text/event-stream");
    const reader = stream.body?.getReader();
    if (!reader) throw new Error("no response body");
    const { value } = await reader.read();
    expect(new TextDecoder().decode(value)).toContain(": connected");
    await reader.cancel();
  });

  it("broadcasts a plan's change, naming the plan", async () => {
    // subscribe first, then change the plan, then read until the event arrives
    const stream = await fetch(new URL("/api/events", baseUrl));
    const reader = stream.body?.getReader();
    if (!reader) throw new Error("no response body");

    await post(
      `/api/plans/${planId}/entries`,
      new URLSearchParams({ course: "COMP6390", session: "2026-S2" }),
    );

    const decoder = new TextDecoder();
    let received = "";
    while (!received.includes(planId)) {
      const { value, done } = await reader.read();
      if (done) throw new Error("stream ended before the event arrived");
      received += decoder.decode(value, { stream: true });
    }
    await reader.cancel();
    const data = received
      .split("\n")
      .filter((line) => line.startsWith("data: "))
      .map((line) => JSON.parse(line.slice("data: ".length)))
      .find((change) => change.planId === planId);
    expect(data).toEqual({ planId, kind: "entry-added" });
  }, 10_000);
});
