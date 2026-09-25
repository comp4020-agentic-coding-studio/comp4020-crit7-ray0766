import { EventEmitter } from "node:events";

// One process, one bus: every open SSE connection subscribes here, and a
// change to a plan is broadcast to all of them. This only works because the
// app runs on exactly one machine (see fly.toml) — a second machine would
// have its own bus and clients would miss events.
export const bus = new EventEmitter();
bus.setMaxListeners(0);

export interface PlanEvent {
  planId: string;
  kind: "entry-added" | "entry-removed" | "plan-extended";
}
