import { json, options } from "@/lib/http";
import type { SwarmTask } from "@/lib/types";
import { verifySwarm } from "@/lib/verify";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function OPTIONS() {
  return options();
}

function isTask(value: unknown): value is SwarmTask {
  if (!value || typeof value !== "object") return false;
  const task = value as SwarmTask;
  return typeof task.id === "string" && typeof task.artifact === "string" && typeof task.check === "string";
}

export async function POST(request: Request) {
  let body: { tasks?: unknown };
  try {
    body = (await request.json()) as { tasks?: unknown };
  } catch {
    return json({ error: "Expected JSON." }, 400);
  }
  if (!Array.isArray(body.tasks) || body.tasks.length === 0 || body.tasks.length > 12 || !body.tasks.every(isTask)) {
    return json({ error: "tasks must be a list of agent artifacts." }, 400);
  }
  return json({ results: verifySwarm(body.tasks) });
}
