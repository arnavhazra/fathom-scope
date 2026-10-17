import { createHmac, timingSafeEqual } from "node:crypto";

import { extractErrorSites, extractExports, tokenize } from "@/lib/export-guard";
import { analyzeSql } from "@/lib/sql-ast";
import type { GateEvidence, SwarmTask } from "@/lib/types";

const SWALLOW = new Set(["log-and-return", "log-and-continue", "return-fallback", "swallow", "empty"]);

export function verifyHmacSha256(rawBody: string, signature: string, secret: string): boolean {
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function hmacOracle(): { ok: boolean; lines: string[] } {
  const secret = "whsec_fathom_scope";
  const body = JSON.stringify({ callId: "call_01", event: "call.ended" });
  const good = createHmac("sha256", secret).update(body).digest("hex");
  const tampered = createHmac("sha256", secret).update(`${body}x`).digest("hex");
  const wrong = createHmac("sha256", "other-secret").update(body).digest("hex");
  const valid = verifyHmacSha256(body, good, secret) === true;
  const rejectsTamper = verifyHmacSha256(body, tampered, secret) === false;
  const rejectsWrong = verifyHmacSha256(body, wrong, secret) === false;
  return {
    ok: valid && rejectsTamper && rejectsWrong,
    lines: [
      `Independent HMAC-SHA256 oracle: valid signature ${valid ? "accepted" : "FAILED"}, tampered body ${rejectsTamper ? "rejected" : "FAILED"}, wrong secret ${rejectsWrong ? "rejected" : "FAILED"}.`,
      "The agent's own unit log is not an input. This oracle signs a body the agent never saw.",
    ],
  };
}

function missingExports(artifact: string, required: string[]): string[] {
  const found = new Set(extractExports(tokenize(artifact)).map((item) => item.name));
  return required.filter((name) => !found.has(name));
}

function swallowed(artifact: string): string[] {
  return extractErrorSites(tokenize(artifact))
    .filter((site) => SWALLOW.has(site.behavior))
    .map((site) => `${site.key} is ${site.behavior} (catch ${site.binding ?? "unbound"})`);
}

function finish(id: string, failures: string[], notes: string[]): GateEvidence {
  const evidence = [
    "Agent self-report ignored. The gate reads the artifact only.",
    ...notes,
    ...failures.map((failure) => `Fail: ${failure}`),
  ];
  evidence.push(failures.length === 0 ? "Gate PASS." : "Gate FAIL.");
  return { id, gate: failures.length === 0 ? "PASS" : "FAIL", evidence };
}

function verifyOne(task: SwarmTask): GateEvidence {
  if (task.check === "schema-ast") {
    const ast = analyzeSql(task.artifact);
    const notes = [
      `Schema migration AST: ${ast.tables.length} CREATE TABLE (${ast.tables.join(", ") || "none"}).`,
      `RLS enabled on ${ast.rls.length}. Policies: ${ast.policies.length}.`,
    ];
    const failures: string[] = [];
    if (ast.tables.length < 2) failures.push("fewer than two tables");
    if (ast.missingRls.length) failures.push(`RLS missing on ${ast.missingRls.join(", ")}`);
    if (ast.tablesWithoutPolicy.length) failures.push(`no CREATE POLICY for ${ast.tablesWithoutPolicy.join(", ")}`);
    return finish(task.id, failures, notes);
  }

  const failures: string[] = [];
  const notes: string[] = [];
  if (task.check === "hmac-export") {
    const oracle = hmacOracle();
    notes.push(...oracle.lines);
    if (!oracle.ok) failures.push("HMAC oracle failed");
  }
  const missing = missingExports(task.artifact, task.requiredExports);
  if (missing.length) {
    failures.push(`public export contract missing ${missing.join(", ")}. External plugins cannot import ${missing.length === 1 ? "it" : "them"}.`);
  } else if (task.requiredExports.length) {
    notes.push(`Public export contract holds: ${task.requiredExports.join(", ")}.`);
  }
  if (task.needle && !task.artifact.toLowerCase().includes(task.needle.toLowerCase())) {
    failures.push(`contract needle "${task.needle}" is absent`);
  } else if (task.needle) {
    notes.push(`Contract needle present: ${task.needle}.`);
  }
  const bad = swallowed(task.artifact);
  if (bad.length) {
    failures.push(`error-propagation mutated: ${bad.join("; ")}`);
  } else if (task.check === "sync-semantics" || task.check === "voice-contract") {
    notes.push("Catch sites still propagate.");
  }
  if (/console\.(log|info|debug)\([^)]*transcript/i.test(task.artifact)) {
    failures.push("artifact logs transcript content");
  }
  return finish(task.id, failures, notes);
}

export function verifySwarm(tasks: SwarmTask[]): GateEvidence[] {
  return tasks.map(verifyOne);
}
