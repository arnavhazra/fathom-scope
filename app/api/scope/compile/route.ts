import { compileScope } from "@/lib/compile-scope";
import { json, options } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function OPTIONS() {
  return options();
}

export async function POST(request: Request) {
  let body: { recordingId?: unknown; transcript?: unknown };
  try {
    body = (await request.json()) as { recordingId?: unknown; transcript?: unknown };
  } catch {
    return json({ error: "Expected JSON." }, 400);
  }
  try {
    const scope = compileScope({
      recordingId: typeof body.recordingId === "string" ? body.recordingId : undefined,
      transcript: typeof body.transcript === "string" ? body.transcript : undefined,
    });
    return json(scope);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not compile scope.";
    return json({ error: message }, 400);
  }
}
