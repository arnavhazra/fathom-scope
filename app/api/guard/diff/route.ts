import { diffContract } from "@/lib/export-guard";
import { json, options } from "@/lib/http";
import type { AgentCi } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function OPTIONS() {
  return options();
}

function readCi(value: unknown): AgentCi | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { passed?: unknown; total?: unknown };
  if (typeof record.passed !== "number" || typeof record.total !== "number") return null;
  return { passed: record.passed, total: record.total };
}

export async function POST(request: Request) {
  let body: { main?: unknown; branch?: unknown; branchName?: unknown; agentCi?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "Expected JSON." }, 400);
  }
  if (typeof body.main !== "string" || typeof body.branch !== "string") {
    return json({ error: "main and branch TypeScript source are required." }, 400);
  }
  if (body.main.length > 200_000 || body.branch.length > 200_000) {
    return json({ error: "Source is too large for the diff gate." }, 400);
  }
  const report = diffContract(body.main, body.branch);
  return json({
    ...report,
    branchName: typeof body.branchName === "string" ? body.branchName : null,
    agentCi: readCi(body.agentCi),
  });
}
