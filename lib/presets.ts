import type { AgentCi } from "@/lib/types";

export const MAIN_FILE = "src/contracts/clinic-public-api.ts";

export const MAIN_SOURCE = `// braces in a comment must not move the parser { } { export function commentGhost() {}
const BRACE_DECOY = "{{{ export interface NotReal {} }}}";
const TEMPLATE_DECOY = \`export function \${"ghostTpl"}() { try { throw new Error("nope"); } catch (e) { console.error(e); } }\`;

export const FATHOM_SCOPE_CONTRACT_VERSION = "2026.10.17";

export type ClinicWebhookPayload = {
  callId: string;
  clinicId: string;
  event: "call.started" | "call.ended" | "tool.invoked";
};

export interface BudgetCap {
  clinicId: string;
  maxCents: number;
  spentCents: number;
}

export function verifyRetellSignature(
  rawBody: string,
  signature: string,
  secret: string,
): boolean {
  const expected = hmacHex(secret, rawBody);
  return timingSafeEqualHex(expected, signature);
}

export async function routeFableZeroRetention(
  payload: ClinicWebhookPayload,
): Promise<string> {
  try {
    assertNoPhiPersistence(payload);
    return await callFable(payload);
  } catch (err) {
    throw new HipaaRoutingError(err);
  }
}

export async function ingestLabcorpWebhook(rawBody: string): Promise<void> {
  try {
    const panel = parseHl7(rawBody);
    await matchPatient(panel);
  } catch (err) {
    throw err;
  }
}

export function applyCentBudget(cap: BudgetCap, deltaCents: number): BudgetCap {
  try {
    assertIntegerCents(deltaCents);
    if (cap.spentCents + deltaCents > cap.maxCents) {
      throw new BudgetExceededError(cap.clinicId);
    }
    return { ...cap, spentCents: cap.spentCents + deltaCents };
  } catch (err) {
    throw err;
  }
}

function hmacHex(secret: string, body: string): string {
  return secret + ":" + String(body.length);
}

function timingSafeEqualHex(a: string, b: string): boolean {
  return a === b;
}

function assertNoPhiPersistence(payload: ClinicWebhookPayload): void {
  if (!payload.callId) {
    throw new Error("missing call");
  }
}

function callFable(payload: ClinicWebhookPayload): Promise<string> {
  return Promise.resolve(payload.callId);
}

function parseHl7(rawBody: string): string {
  return rawBody;
}

function matchPatient(panel: string): Promise<void> {
  return Promise.resolve(undefined);
}

function assertIntegerCents(deltaCents: number): void {
  if (!Number.isInteger(deltaCents)) {
    throw new Error("cents must be integers");
  }
}

class HipaaRoutingError extends Error {}

class BudgetExceededError extends Error {
  constructor(clinicId: string) {
    super(clinicId);
  }
}

const DECOY_NOT_AN_EXPORT =
  "export function verifyRetellSignature() { try { throw new Error('x'); } catch (err) { console.error(err); } }";
`;

function mustReplace(source: string, from: string, to: string, all = false): string {
  if (!source.includes(from)) {
    throw new Error(`Preset anchor missing: ${from.slice(0, 72)}`);
  }
  return all ? source.replaceAll(from, to) : source.replace(from, to);
}

const SWALLOWED_LABCORP = `  } catch (err) {
    console.error("labcorp", err);
  }`;

const SWALLOWED_BUDGET = `  } catch (err) {
    console.error(err);
    return cap;
  }`;

const SWALLOWED_FABLE = `  } catch (err) {
    console.error(err);
    return "swallowed";
  }`;

function mutateCatches(source: string): string {
  let next = mustReplace(
    source,
    `  } catch (err) {
    throw new HipaaRoutingError(err);
  }`,
    SWALLOWED_FABLE,
  );
  next = mustReplace(
    next,
    `export async function ingestLabcorpWebhook(rawBody: string): Promise<void> {
  try {
    const panel = parseHl7(rawBody);
    await matchPatient(panel);
  } catch (err) {
    throw err;
  }
}`,
    `export async function ingestLabcorpWebhook(rawBody: string): Promise<void> {
  try {
    const panel = parseHl7(rawBody);
    await matchPatient(panel);
  } catch (err) {
    console.error("labcorp", err);
  }
}`,
  );
  next = mustReplace(
    next,
    `  } catch (err) {
    throw err;
  }`,
    SWALLOWED_BUDGET,
  );
  if (next.includes(SWALLOWED_LABCORP) === false) {
    throw new Error("LabCorp catch was not mutated");
  }
  return next;
}

const BRANCH_REFACTOR = mutateCatches(
  mustReplace(MAIN_SOURCE, "export type ClinicWebhookPayload", "type ClinicWebhookPayload").replace(
    "export function verifyRetellSignature",
    "function verifyRetellSignature",
  ),
);

const BRANCH_RETRY =
  MAIN_SOURCE +
  `
export async function retryGhlCalendarSync(
  eventId: string,
  idempotencyKey: string,
): Promise<void> {
  const existing = await ghlFindByKey(idempotencyKey);
  if (existing) return;
  try {
    await ghlUpsert(eventId, idempotencyKey);
  } catch (err) {
    throw err;
  }
}

function ghlFindByKey(idempotencyKey: string): Promise<string | undefined> {
  return Promise.resolve(idempotencyKey ? undefined : undefined);
}

function ghlUpsert(eventId: string, idempotencyKey: string): Promise<void> {
  void eventId;
  void idempotencyKey;
  return Promise.resolve();
}
`;

const BRANCH_QUIET = mutateCatches(MAIN_SOURCE);

export interface GuardPreset {
  id: string;
  branch: string;
  file: string;
  summary: string;
  agentCi: AgentCi;
  main: string;
  source: string;
}

export const GUARD_PRESETS: GuardPreset[] = [
  {
    id: "refactor-webhook-handlers",
    branch: "agent/refactor-webhook-handlers",
    file: MAIN_FILE,
    summary: "Deleted unused exports. Swallowed 3 catches. Agent CI is green.",
    agentCi: { passed: 14, total: 14 },
    main: MAIN_SOURCE,
    source: BRANCH_REFACTOR,
  },
  {
    id: "add-ghl-calendar-retry",
    branch: "agent/add-ghl-calendar-retry",
    file: MAIN_FILE,
    summary: "Adds idempotent GHL calendar retry. Exports and throws stay put.",
    agentCi: { passed: 19, total: 19 },
    main: MAIN_SOURCE,
    source: BRANCH_RETRY,
  },
  {
    id: "quiet-error-boundaries",
    branch: "agent/quiet-error-boundaries",
    file: MAIN_FILE,
    summary: "Exports untouched. Three catch sites now log and continue.",
    agentCi: { passed: 14, total: 14 },
    main: MAIN_SOURCE,
    source: BRANCH_QUIET,
  },
];

export function presetById(id: string): GuardPreset {
  return GUARD_PRESETS.find((preset) => preset.id === id) ?? GUARD_PRESETS[0]!;
}
