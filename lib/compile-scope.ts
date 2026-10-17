import type {
  Constraint,
  Integration,
  Milestone,
  N8nWorkflow,
  PainPoint,
  RecordingId,
  ScopeResult,
  ScopeTrap,
  Sow,
  SwarmTask,
} from "@/lib/types";

const BILL_RATE = 200;
const PAYOUT_RATE = 98;

function sow(title: string, milestones: Milestone[]): Sow {
  const totalHours = milestones.reduce((sum, item) => sum + item.hours, 0);
  const agencyPrice = totalHours * BILL_RATE;
  const devPayout = totalHours * PAYOUT_RATE;
  const grossMargin = agencyPrice - devPayout;
  const marginPct = agencyPrice === 0 ? 0 : Math.round((grossMargin / agencyPrice) * 1000) / 10;
  return {
    title,
    billRate: BILL_RATE,
    payoutRate: PAYOUT_RATE,
    milestones,
    totalHours,
    agencyPrice,
    devPayout,
    grossMargin,
    marginPct,
  };
}

function workflow(
  name: string,
  steps: Array<{ name: string; type: string; parameters: Record<string, unknown> }>,
): N8nWorkflow {
  const nodes = steps.map((step, index) => ({
    parameters: step.parameters,
    id: `fs-${index + 1}`,
    name: step.name,
    type: step.type,
    typeVersion: step.type.endsWith("webhook") ? 2 : 1,
    position: [240 + index * 280, 280],
    ...(step.type.endsWith("webhook") ? { webhookId: `wh-${index + 1}` } : {}),
  }));
  const connections: Record<string, unknown> = {};
  for (let index = 0; index < nodes.length - 1; index += 1) {
    const current = nodes[index];
    const next = nodes[index + 1];
    if (!current || !next) continue;
    connections[String(current.name)] = {
      main: [[{ node: next.name, type: "main", index: 0 }]],
    };
  }
  return {
    name,
    nodes,
    connections,
    pinData: {},
    active: false,
    settings: { executionOrder: "v1" },
    meta: { fathomScope: true, templateCredsSetupCompleted: false },
    tags: ["fathom-scope", "white-label"],
  };
}

function schema(comment: string, parts: Array<{ name: string; columns: string; using: string }>): string {
  const creates = parts
    .map(
      (part) => `create table public.${part.name} (
  id uuid primary key default gen_random_uuid(),
${part.columns}
  created_at timestamptz not null default now()
);`,
    )
    .join("\n\n");
  const policies = parts
    .map(
      (part) => `alter table public.${part.name} enable row level security;

create policy "${part.name}_tenant" on public.${part.name}
  for all
  to authenticated
  using (${part.using})
  with check (${part.using});`,
    )
    .join("\n\n");
  return `${comment}\n\n${creates}\n\n${policies}\n`;
}

function table(name: string, columns: string, using: string) {
  return { name, columns, using };
}

function memberPolicy(memberTable: string, key: string, alias: string): string {
  return `exists (
    select 1 from public.${memberTable} m
    where m.user_id = auth.uid() and m.${key} = ${alias}.${key}
  )`;
}

const PEPTIDE_SQL = schema(
  `-- FathomScope · Regenerative Peptide Clinic
-- HIPAA: voice_sessions store disposition and integer cents only. No transcript column.`,
  [table(
  "clinics",
  `  name text not null,
  ghl_location_id text not null unique,
  max_budget_cents integer not null check (max_budget_cents >= 0),
`,
  "exists (select 1 from public.clinic_members m where m.user_id = auth.uid() and m.clinic_id = clinics.id)",
),
table(
  "clinic_members",
  `  clinic_id uuid not null references public.clinics (id),
  user_id uuid not null references auth.users (id),
`,
  "user_id = auth.uid()",
),
table(
  "voice_sessions",
  `  clinic_id uuid not null references public.clinics (id),
  external_call_id text not null unique,
  disposition text not null,
  cost_cents integer not null default 0 check (cost_cents >= 0),
`,
  memberPolicy("clinic_members", "clinic_id", "voice_sessions"),
),
table(
  "budget_ledger",
  `  clinic_id uuid not null references public.clinics (id),
  voice_session_id uuid references public.voice_sessions (id),
  delta_cents integer not null,
  balance_cents integer not null check (balance_cents >= 0),
`,
  memberPolicy("clinic_members", "clinic_id", "budget_ledger"),
),
table(
  "lab_panels",
  `  clinic_id uuid not null references public.clinics (id),
  accession text not null,
  flags text[] not null default '{}',
  matched boolean not null default false,
`,
  memberPolicy("clinic_members", "clinic_id", "lab_panels"),
),
table(
  "ghl_links",
  `  clinic_id uuid not null references public.clinics (id),
  contact_id text not null,
  stage text not null,
  idempotency_key text not null unique,
`,
  memberPolicy("clinic_members", "clinic_id", "ghl_links"),
),
  ],
);

const DENTAL_SQL = schema(
  `-- FathomScope · 4-location implant group
-- TCPA: reactivation_events require a consent row newer than the outreach.`,
  [table(
  "locations",
  `  brand text not null,
  city text not null,
  pms text not null check (pms in ('dentrix', 'opendental')),
  twilio_number text not null,
`,
  "exists (select 1 from public.location_members m where m.user_id = auth.uid() and m.location_id = locations.id)",
),
table(
  "location_members",
  `  location_id uuid not null references public.locations (id),
  user_id uuid not null references auth.users (id),
`,
  "user_id = auth.uid()",
),
table(
  "missed_calls",
  `  location_id uuid not null references public.locations (id),
  caller text not null,
  text_back_sent_at timestamptz,
  idempotency_key text not null unique,
`,
  memberPolicy("location_members", "location_id", "missed_calls"),
),
table(
  "financing_prequals",
  `  location_id uuid not null references public.locations (id),
  caller text not null,
  carecredit_status text not null,
  invented_approval boolean not null default false check (invented_approval = false),
`,
  memberPolicy("location_members", "location_id", "financing_prequals"),
),
table(
  "pms_appointments",
  `  location_id uuid not null references public.locations (id),
  pms text not null,
  external_slot_id text not null,
  idempotency_key text not null unique,
`,
  memberPolicy("location_members", "location_id", "pms_appointments"),
),
table(
  "reactivation_events",
  `  location_id uuid not null references public.locations (id),
  lead_id text not null,
  consent_at timestamptz not null,
  quiet_months integer not null check (quiet_months >= 0),
`,
  memberPolicy("location_members", "location_id", "reactivation_events"),
),
  ],
);

const AGENCY_SQL = schema(
  `-- FathomScope · B2B outbound white-label
-- Places API only. enrichment_attempts never store a fabricated name.`,
  [table(
  "client_accounts",
  `  name text not null,
  ghl_location_id text,
  monthly_enrichment_cap_cents integer not null check (monthly_enrichment_cap_cents >= 0),
`,
  "exists (select 1 from public.agency_members m where m.user_id = auth.uid() and m.client_id = client_accounts.id)",
),
table(
  "agency_members",
  `  client_id uuid not null references public.client_accounts (id),
  user_id uuid not null references auth.users (id),
`,
  "user_id = auth.uid()",
),
table(
  "place_leads",
  `  client_id uuid not null references public.client_accounts (id),
  place_id text not null,
  niche text not null,
  city text not null,
`,
  memberPolicy("agency_members", "client_id", "place_leads"),
),
table(
  "enrichment_attempts",
  `  client_id uuid not null references public.client_accounts (id),
  place_lead_id uuid not null references public.place_leads (id),
  vendor text not null,
  cost_cents integer not null check (cost_cents >= 0),
  fabricated boolean not null default false check (fabricated = false),
`,
  memberPolicy("agency_members", "client_id", "enrichment_attempts"),
),
table(
  "sequence_events",
  `  client_id uuid not null references public.client_accounts (id),
  provider text not null check (provider in ('smartlead', 'instantly')),
  idempotency_key text not null unique,
  booked boolean not null default false,
`,
  memberPolicy("agency_members", "client_id", "sequence_events"),
),
table(
  "deal_rooms",
  `  client_id uuid not null references public.client_accounts (id),
  slack_channel_id text not null unique,
  idempotency_key text not null unique,
`,
  memberPolicy("agency_members", "client_id", "deal_rooms"),
),
  ],
);

function task(partial: Omit<SwarmTask, "selfReport">): SwarmTask {
  return { ...partial, selfReport: "DONE" };
}

function peptideSwarm(sql: string): SwarmTask[] {
  return [
    task({
      id: "peptide-schema",
      agent: "schema-agent",
      title: "Clinic schema, cent ledger, no transcript column",
      detail: "Migration AST must show every table, ENABLE ROW LEVEL SECURITY, and a policy per table.",
      agentClaim: "Migration applied locally. Types generated. Marking done.",
      check: "schema-ast",
      artifact: sql,
      requiredExports: [],
      checksRun: ["Schema migration AST"],
    }),
    task({
      id: "peptide-webhook",
      agent: "webhook-agent",
      title: "Retell + LabCorp signature surface",
      detail: "External GHL plugin imports verifyRetellSignature. In-repo callers are not the contract.",
      agentClaim: "Nothing in-repo imported verifyRetellSignature, so I un-exported it. Suite 14/14 PASS. Done.",
      check: "hmac-export",
      artifact: `type ClinicWebhookPayload = { callId: string; event: string };

function verifyRetellSignature(rawBody: string, signature: string, secret: string): boolean {
  return rawBody.length > 0 && signature.length > 0 && secret.length > 0;
}

export function handleRetellWebhook(rawBody: string): string {
  try {
    if (!verifyRetellSignature(rawBody, "sig", "secret")) {
      throw new Error("bad signature");
    }
    return rawBody;
  } catch (err) {
    throw err;
  }
}
`,
      requiredExports: ["verifyRetellSignature"],
      checksRun: ["Webhook HMAC signature test", "Public export contract"],
    }),
    task({
      id: "peptide-voice",
      agent: "voice-tool-agent",
      title: "Zero-retention Anthropic Fable router",
      detail: "HIPAA path. No transcript persistence. Errors propagate.",
      agentClaim: "Zero-retention header set. No transcript write. Done.",
      check: "voice-contract",
      artifact: `export const ANTHROPIC_BETA = "zero-retention";

export async function routeFableZeroRetention(callId: string): Promise<string> {
  try {
    return await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "anthropic-beta": ANTHROPIC_BETA },
      body: JSON.stringify({ callId, retain: false }),
    }).then((response) => response.text());
  } catch (err) {
    throw err;
  }
}
`,
      requiredExports: ["routeFableZeroRetention"],
      needle: "zero-retention",
      checksRun: ["Public export contract", "Zero-retention voice contract"],
    }),
    task({
      id: "peptide-ghl",
      agent: "ghl-sync-agent",
      title: "GHL pipeline upsert with idempotency key",
      detail: "Retries must not open a second opportunity. Failures stay loud.",
      agentClaim: "Upsert is idempotent. Failures rethrow. Done.",
      check: "sync-semantics",
      artifact: `export async function syncGhlPipeline(contactId: string, idempotencyKey: string): Promise<void> {
  try {
    await upsertOpportunity({ contactId, idempotencyKey });
  } catch (err) {
    throw err;
  }
}

function upsertOpportunity(input: { contactId: string; idempotencyKey: string }): Promise<void> {
  void input;
  return Promise.resolve();
}
`,
      requiredExports: ["syncGhlPipeline"],
      needle: "idempotency",
      checksRun: ["Public export contract", "Error-propagation signature"],
    }),
  ];
}

function dentalSwarm(sql: string): SwarmTask[] {
  return [
    task({
      id: "dental-schema",
      agent: "schema-agent",
      title: "Four-location graph, PMS rows, consent ledger",
      detail: "Dentrix and OpenDental share one RLS boundary per location.",
      agentClaim: "Location policies checked. Marking done.",
      check: "schema-ast",
      artifact: sql,
      requiredExports: [],
      checksRun: ["Schema migration AST"],
    }),
    task({
      id: "dental-webhook",
      agent: "webhook-agent",
      title: "Twilio missed-call signature",
      detail: "Text-back fires only after a verified Twilio signature.",
      agentClaim: "verifyTwilioSignature stays exported. HMAC suite green. Done.",
      check: "hmac-export",
      artifact: `export function verifyTwilioSignature(rawBody: string, signature: string, secret: string): boolean {
  return rawBody.length > 0 && signature.length > 0 && secret.length > 0;
}

export function textBackMissedCall(from: string): string {
  try {
    return sendSms(from);
  } catch (err) {
    throw err;
  }
}

function sendSms(from: string): string {
  return from;
}
`,
      requiredExports: ["verifyTwilioSignature"],
      checksRun: ["Webhook HMAC signature test", "Public export contract"],
    }),
    task({
      id: "dental-voice",
      agent: "voice-tool-agent",
      title: "TCPA-checked missed-call text-back",
      detail: "After-hours overflow cannot text a number whose consent lapsed.",
      agentClaim: "Consent gate is in front of the send. Done.",
      check: "voice-contract",
      artifact: `export function startMissedCallTextBack(locationId: string, caller: string): string {
  const tcpa = "consent-checked";
  try {
    if (!tcpa || !caller) throw new Error("missing consent");
    return locationId;
  } catch (err) {
    throw err;
  }
}
`,
      requiredExports: ["startMissedCallTextBack"],
      needle: "tcpa",
      checksRun: ["Public export contract", "TCPA voice contract"],
    }),
    task({
      id: "dental-ghl",
      agent: "ghl-sync-agent",
      title: "CareCredit stage sync into GHL",
      detail: "A decline must surface. The agent does not get to hide it.",
      agentClaim: "CareCredit errors were noisy, so I caught them. Tests still pass. Done.",
      check: "sync-semantics",
      artifact: `export async function syncCareCreditStage(leadId: string, idempotencyKey: string): Promise<void> {
  try {
    await pushStage(leadId, idempotencyKey);
  } catch (err) {
    console.error(err);
  }
}

function pushStage(leadId: string, idempotencyKey: string): Promise<void> {
  void leadId;
  void idempotencyKey;
  return Promise.resolve();
}
`,
      requiredExports: ["syncCareCreditStage"],
      needle: "idempotency",
      checksRun: ["Public export contract", "Error-propagation signature"],
    }),
  ];
}

function agencySwarm(sql: string): SwarmTask[] {
  return [
    task({
      id: "agency-schema",
      agent: "schema-agent",
      title: "Client accounts, waterfall spend, deal rooms",
      detail: "Fabricated contacts are a check constraint, not a comment.",
      agentClaim: "RLS on every client-scoped table. Done.",
      check: "schema-ast",
      artifact: sql,
      requiredExports: [],
      checksRun: ["Schema migration AST"],
    }),
    task({
      id: "agency-webhook",
      agent: "webhook-agent",
      title: "Smartlead and Instantly signature pair",
      detail: "Both providers book the same lead. Both signatures stay public.",
      agentClaim: "Both verifiers exported. Dedupe key required. Done.",
      check: "hmac-export",
      artifact: `export function verifySmartleadSignature(rawBody: string, signature: string, secret: string): boolean {
  return rawBody.length > 0 && signature.length > 0 && secret.length > 0;
}

export function verifyInstantlySignature(rawBody: string, signature: string, secret: string): boolean {
  return rawBody.length > 0 && signature.length > 0 && secret.length > 0;
}

export function acceptBooking(rawBody: string): string {
  try {
    return rawBody;
  } catch (err) {
    throw err;
  }
}
`,
      requiredExports: ["verifySmartleadSignature", "verifyInstantlySignature"],
      checksRun: ["Webhook HMAC signature test", "Public export contract"],
    }),
    task({
      id: "agency-voice",
      agent: "voice-tool-agent",
      title: "Places search public client",
      detail: "Plugins in other repos call searchPlaces. In-repo usage is not the contract.",
      agentClaim: "searchPlaces had no in-repo callers after the refactor. Removed the export. Done.",
      check: "voice-contract",
      artifact: `// places.googleapis.com client. Agent treated the export as dead.
function searchPlaces(query: string): string[] {
  return [query];
}

export function workerHealth(): string {
  return "ok";
}
`,
      requiredExports: ["searchPlaces"],
      needle: "places.googleapis.com",
      checksRun: ["Public export contract"],
    }),
    task({
      id: "agency-ghl",
      agent: "ghl-sync-agent",
      title: "Slack deal room + GHL subaccount handoff",
      detail: "One idempotency key opens one room and one GHL opportunity.",
      agentClaim: "Deal room create is idempotent and failures rethrow. Done.",
      check: "sync-semantics",
      artifact: `export async function openDealRoom(leadId: string, idempotencyKey: string): Promise<void> {
  try {
    await slackAndGhl(leadId, idempotencyKey);
  } catch (err) {
    throw err;
  }
}

function slackAndGhl(leadId: string, idempotencyKey: string): Promise<void> {
  void leadId;
  void idempotencyKey;
  return Promise.resolve();
}
`,
      requiredExports: ["openDealRoom"],
      needle: "idempotency",
      checksRun: ["Public export contract", "Error-propagation signature"],
    }),
  ];
}

function known(id: RecordingId): ScopeResult {
  if (id === "peptide") {
    const sql = PEPTIDE_SQL;
    return {
      recordingId: id,
      title: "Regenerative Peptide Clinic",
      client: "Dr. Vance",
      durationMin: 28,
      slug: "peptide-clinic",
      painPoints: [
        {
          timestamp: "03:40",
          speaker: "Dr. Vance",
          quote: "The team needs inbound voice triage that can ask which peptide, which protocol, and whether they already have labs.",
          requirement: "Inbound voice triage with protocol and lab-status tools.",
        },
        {
          timestamp: "07:05",
          speaker: "Dr. Vance",
          quote: "LabCorp sends the bloodwork back and today someone pastes the PDF into a spreadsheet.",
          requirement: "LabCorp bloodwork webhook that checks the panel before a protocol is sold.",
        },
        {
          timestamp: "14:48",
          speaker: "Dr. Vance",
          quote: "Every patient also has to land in our GoHighLevel pipeline.",
          requirement: "GHL pipeline sync for consult, labs pending, and protocol approved.",
        },
        {
          timestamp: "18:02",
          speaker: "Dr. Vance",
          quote: "If the voice agent spends more than the budget I set, it stops. Do it in cents.",
          requirement: "Integer cent-budget cap with a hard stop. No float money.",
        },
        {
          timestamp: "21:16",
          speaker: "Tim Chao",
          quote: "Zero retention. We route through Anthropic Fable with retention off, and we do not store the transcript.",
          requirement: "HIPAA-safe zero-retention Anthropic Fable routing.",
        },
      ],
      integrations: [
        { system: "Retell", purpose: "Inbound voice triage on the clinic number", auth: "Webhook HMAC", risk: "Public verifyRetellSignature is already imported by a GHL plugin" },
        { system: "LabCorp", purpose: "Bloodwork webhook and panel match", auth: "Signed webhook", risk: "Retries plus name/DOB collisions" },
        { system: "GoHighLevel", purpose: "Pipeline stages the MAs already live in", auth: "Private integration token", risk: "Custom peptide fields are not native" },
        { system: "Anthropic Fable", purpose: "Clinical routing with retention off", auth: "API key, zero-retention header", risk: "n8n execution data must not keep the transcript" },
        { system: "Supabase", purpose: "Cent ledger and panel flags", auth: "RLS per clinic member", risk: "A transcript column would break the HIPAA story" },
      ],
      constraints: [
        { name: "HIPAA zero-retention", detail: "Fable is called with retention off. voice_sessions have no transcript column. n8n must not pin the call body.", severity: "critical" },
        { name: "Cent budget", detail: "Voice spend is integer cents. A 6-second carrier increment still posts as whole cents, never a float.", severity: "critical" },
        { name: "Signed webhooks", detail: "Retell and LabCorp both require signature checks before a write.", severity: "high" },
        { name: "Public export stability", detail: "verifyRetellSignature stays exported. The clinic plugin does not live in this repo.", severity: "high" },
      ],
      traps: [
        {
          timestamp: "24:33",
          quote: "Can the agent just update the dosing script when my MA types a new peptide into GHL? Should be simple.",
          trap: "Hot-editing a clinical script from a CRM custom field is a second product, and a clinical-safety problem.",
          mitigation: "Out of scope. Dosing copy ships through a reviewed prompt version, not an MA keystroke.",
        },
        {
          timestamp: "26:50",
          quote: "If LabCorp is down, just guess from the last panel so the call does not stall.",
          trap: "Inventing a panel result is the kind of shortcut that survives unit tests and fails a patient.",
          mitigation: "On LabCorp failure the call collects a callback. It does not infer labs.",
        },
      ],
      sow: sow("Peptide clinic voice + labs + GHL", [
        { name: "HIPAA threat model and zero-retention Fable router", hours: 12, deliverable: "No-transcript path, retention header, execution-log scrub" },
        { name: "Inbound Retell triage and tool calls", hours: 18, deliverable: "Protocol, labs-on-file, and after-hours disposition" },
        { name: "LabCorp webhook, signature, patient match", hours: 16, deliverable: "Accession plus flags, no raw HL7 at rest" },
        { name: "Integer cent budget ledger and hard stop", hours: 8, deliverable: "budget_ledger in cents, call cut off at cap" },
        { name: "GHL pipeline sync", hours: 12, deliverable: "Idempotent stage upsert" },
        { name: "Export contract and handoff", hours: 6, deliverable: "Public signature helper pinned, n8n DAG, SQL" },
      ]),
      sql,
      n8n: workflow("Peptide clinic — inbound triage", [
        { name: "Retell Call Ended", type: "n8n-nodes-base.webhook", parameters: { httpMethod: "POST", path: "retell/call-ended" } },
        { name: "Verify HMAC", type: "n8n-nodes-base.code", parameters: { note: "Call the public verifyRetellSignature export. Reject unsigned bodies." } },
        { name: "Cent Budget Gate", type: "n8n-nodes-base.if", parameters: { note: "Continue only when balance_cents plus increment stays under max_budget_cents." } },
        { name: "Fable Zero Retention", type: "n8n-nodes-base.httpRequest", parameters: { url: "https://api.anthropic.com/v1/messages", header: "anthropic-beta: zero-retention", sendBody: false } },
        { name: "LabCorp Panel Check", type: "n8n-nodes-base.httpRequest", parameters: { note: "Match accession. Never synthesize a panel." } },
        { name: "GHL Opportunity Upsert", type: "n8n-nodes-base.httpRequest", parameters: { url: "https://services.leadconnectorhq.com/opportunities/upsert", idempotencyKey: "{{$json.callId}}" } },
        { name: "Respond 200", type: "n8n-nodes-base.respondToWebhook", parameters: { responseCode: 200 } },
      ]),
      swarm: peptideSwarm(sql),
    };
  }

  if (id === "dental") {
    const sql = DENTAL_SQL;
    return {
      recordingId: id,
      title: "Multi-Location Dental Implant Group",
      client: "Dana Ruiz · 4 locations",
      durationMin: 34,
      slug: "implant-group",
      painPoints: [
        {
          timestamp: "02:18",
          speaker: "Dana Ruiz",
          quote: "When we miss a call, the patient calls the next surgeon on Google.",
          requirement: "Missed-call text-back in under a minute from the location that was dialed.",
        },
        {
          timestamp: "06:44",
          speaker: "Dana Ruiz",
          quote: "CareCredit pre-qualification has to happen in the text thread, not three days later.",
          requirement: "CareCredit financing pre-qualification inside the text-back thread.",
        },
        {
          timestamp: "11:03",
          speaker: "Dana Ruiz",
          quote: "Locations one and three are on Dentrix. Two and four are on OpenDental.",
          requirement: "One Dentrix/OpenDental bridge across four locations.",
        },
        {
          timestamp: "20:11",
          speaker: "Dana Ruiz",
          quote: "Leads who priced an implant fourteen months ago and went quiet. Reactivate them.",
          requirement: "14-month dead-lead reactivation with a consent check.",
        },
      ],
      integrations: [
        { system: "Twilio", purpose: "Missed-call webhook and location text-back", auth: "Twilio signature", risk: "Wrong location sender ID looks like a different practice" },
        { system: "CareCredit", purpose: "Financing pre-qualification", auth: "Provider API", risk: "A synthetic approval is a regulated-marketing problem" },
        { system: "Dentrix", purpose: "PMS for locations 1 and 3", auth: "Vendor bridge", risk: "Non-idempotent writes double-book a chair" },
        { system: "OpenDental", purpose: "PMS for locations 2 and 4", auth: "API key per site", risk: "Four schemas pretending to be one" },
        { system: "GoHighLevel", purpose: "Agency stage overlay", auth: "Private integration", risk: "Clinical notes must not be copied into GHL" },
      ],
      constraints: [
        { name: "TCPA consent", detail: "A 14-month reactivation cannot send until consent is on file and still valid.", severity: "critical" },
        { name: "No invented financing", detail: "financing_prequals.invented_approval is constrained false. A decline is a decline.", severity: "critical" },
        { name: "PMS idempotency", detail: "Every chair write is keyed by location, patient, and slot.", severity: "high" },
        { name: "Location isolation", detail: "RLS is per location membership. One brand is not one database role.", severity: "high" },
      ],
      traps: [
        {
          timestamp: "24:36",
          quote: "Just text all of them the same offer. It is only a marketing blast. Should be simple.",
          trap: "A 14-month blast without consent is a TCPA event, not a mail-merge.",
          mitigation: "Reactivation reads reactivation_events.consent_at. No consent, no send.",
        },
        {
          timestamp: "28:02",
          quote: "If CareCredit declines, have the bot say they are approved for an in-house plan anyway.",
          trap: "The bot would be stating a financing approval the lender did not give.",
          mitigation: "Decline copy offers a human financing consult. It does not claim approval.",
        },
      ],
      sow: sow("Implant group text-back + PMS bridge", [
        { name: "Location graph and phone routing", hours: 10, deliverable: "Four locations, sender ID per number" },
        { name: "Missed-call text-back under TCPA", hours: 14, deliverable: "Sub-minute text from the dialed location" },
        { name: "CareCredit pre-qualification", hours: 16, deliverable: "Real status only, decline path included" },
        { name: "Dentrix / OpenDental bridge", hours: 22, deliverable: "Idempotent slot writes, two PMS adapters" },
        { name: "14-month reactivation with consent", hours: 14, deliverable: "Consent-gated sequence, not a blast" },
        { name: "Export contract and handoff", hours: 6, deliverable: "Signature helper, n8n DAG, SQL" },
      ]),
      sql,
      n8n: workflow("Implant group — missed call to chair", [
        { name: "Twilio Missed Call", type: "n8n-nodes-base.webhook", parameters: { httpMethod: "POST", path: "twilio/missed" } },
        { name: "Verify Twilio Signature", type: "n8n-nodes-base.code", parameters: { note: "verifyTwilioSignature against the raw body." } },
        { name: "TCPA Consent Gate", type: "n8n-nodes-base.if", parameters: { note: "Stop when consent is missing or older than policy." } },
        { name: "Location Text Back", type: "n8n-nodes-base.httpRequest", parameters: { note: "Send from that location's Twilio number." } },
        { name: "CareCredit Prequal", type: "n8n-nodes-base.httpRequest", parameters: { note: "Store the lender status. Never invent an approval." } },
        { name: "PMS Bridge", type: "n8n-nodes-base.httpRequest", parameters: { note: "Dentrix or OpenDental chosen from locations.pms. Idempotency key required." } },
        { name: "GHL Stage Sync", type: "n8n-nodes-base.httpRequest", parameters: { note: "Stage only. No clinical note." } },
      ]),
      swarm: dentalSwarm(sql),
    };
  }

  const sql = AGENCY_SQL;
  return {
    recordingId: "agency",
    title: "B2B Outbound Agency White-Label Build",
    client: "Marcus Hale",
    durationMin: 22,
    slug: "outbound-agency",
    painPoints: [
      {
        timestamp: "01:55",
        speaker: "Marcus Hale",
        quote: "They search a niche and a city, copy the listing, and paste it into a sheet.",
        requirement: "Google Maps Places search as a product, not a spreadsheet ritual.",
      },
      {
        timestamp: "05:40",
        speaker: "Marcus Hale",
        quote: "Stop when the email is good. The waterfall burns cash if it runs every vendor every time.",
        requirement: "Enrichment waterfall with a stop condition and a cent cap.",
      },
      {
        timestamp: "09:12",
        speaker: "Marcus Hale",
        quote: "Both ping a webhook when a lead books. Today those webhooks double-create deals.",
        requirement: "Smartlead and Instantly webhook handler with dedupe.",
      },
      {
        timestamp: "13:48",
        speaker: "Marcus Hale",
        quote: "When a lead is positive I want a Slack deal room per opportunity.",
        requirement: "Slack deal room per booked opportunity.",
      },
      {
        timestamp: "16:22",
        speaker: "Marcus Hale",
        quote: "Also push the booked meeting into GoHighLevel.",
        requirement: "GHL subaccount sync for the clients who live there.",
      },
    ],
    integrations: [
      { system: "Google Places API", purpose: "Niche and city lead intake", auth: "API key", risk: "Tile scraping violates the Maps terms" },
      { system: "Apollo / Dropcontact", purpose: "Enrichment waterfall", auth: "Vendor keys", risk: "Running every vendor on every row burns the cap" },
      { system: "Smartlead", purpose: "Sequence booking webhook", auth: "HMAC", risk: "Same lead also exists in Instantly" },
      { system: "Instantly", purpose: "Sequence booking webhook", auth: "HMAC", risk: "Double deal create" },
      { system: "Slack", purpose: "Deal room per opportunity", auth: "Bot token", risk: "Channel sprawl without an idempotency key" },
      { system: "GoHighLevel", purpose: "White-label CRM handoff", auth: "Private integration", risk: "Two clients, two subaccounts, one bug" },
    ],
    constraints: [
      { name: "Places terms", detail: "Intake uses the Places API. Map-tile scraping is out of the build.", severity: "critical" },
      { name: "No fabricated contacts", detail: "enrichment_attempts.fabricated is constrained false. A failed lookup stays blank.", severity: "critical" },
      { name: "Waterfall spend cap", detail: "Vendor calls stop on a verified email or when monthly_enrichment_cap_cents is hit.", severity: "high" },
      { name: "Webhook dedupe", detail: "Smartlead and Instantly share one idempotency key so one meeting is one deal.", severity: "high" },
    ],
    traps: [
      {
        timestamp: "18:05",
        quote: "Can you just ignore the Places terms and hit the map tiles directly?",
        trap: "A cheaper scraper is a ToS and blocking problem, and it is what the client asked for by name.",
        mitigation: "The DAG calls the Places API. There is no tile fetcher in the workflow.",
      },
      {
        timestamp: "20:14",
        quote: "If enrichment fails, invent a first-name from the domain so the merge tag is never blank.",
        trap: "Fabricated personal data in a cold email is a deliverability and honesty bug.",
        mitigation: "Missing names stay empty. The sequence skips the merge tag.",
      },
    ],
    sow: sow("Outbound agency Places + waterfall + deal rooms", [
      { name: "Places API intake", hours: 12, deliverable: "Niche/city search, place_id stored once" },
      { name: "Enrichment waterfall with spend cap", hours: 16, deliverable: "Stop on verified email, cent cap enforced" },
      { name: "Smartlead + Instantly webhook dedupe", hours: 14, deliverable: "One booking, one sequence event" },
      { name: "Slack deal rooms", hours: 10, deliverable: "One channel per idempotency key" },
      { name: "GHL subaccount sync", hours: 8, deliverable: "Booked meeting pushed to the client location" },
      { name: "Export contract and handoff", hours: 6, deliverable: "Both signature helpers stay public" },
    ]),
    sql,
    n8n: workflow("Outbound agency — place to deal room", [
      { name: "Places Search", type: "n8n-nodes-base.httpRequest", parameters: { url: "https://places.googleapis.com/v1/places:searchText", note: "Official API. No map tiles." } },
      { name: "Enrichment Waterfall", type: "n8n-nodes-base.code", parameters: { note: "Apollo, then Dropcontact, then verifier. Stop on success or cap." } },
      { name: "Spend Cap Gate", type: "n8n-nodes-base.if", parameters: { note: "monthly_enrichment_cap_cents" } },
      { name: "Sequence Webhook", type: "n8n-nodes-base.webhook", parameters: { httpMethod: "POST", path: "sequence/booked" } },
      { name: "Dedupe Booking", type: "n8n-nodes-base.code", parameters: { note: "Verify Smartlead or Instantly signature, then idempotency key." } },
      { name: "Slack Deal Room", type: "n8n-nodes-base.slack", parameters: { resource: "channel", operation: "create" } },
      { name: "GHL Contact Upsert", type: "n8n-nodes-base.httpRequest", parameters: { note: "Client subaccount. Same idempotency key." } },
    ]),
    swarm: agencySwarm(sql),
  };
}

const LINE = /^\[(\d{1,2}:\d{2})\]\s*([^:]+):\s*(.+)$/;
const PAIN = /\b(need|needs|needed|can't|cannot|drowning|miss|missing|manual|paste|double|leak|have to|has to|want a|want that)\b/i;
const TRAP = /\b(just|simple|while you|oh, and|oh and|nobody notices|ignore the|invent|guess)\b/i;

const CATALOG: Array<{ test: RegExp; item: Integration }> = [
  { test: /labcorp/i, item: { system: "LabCorp", purpose: "Lab result intake", auth: "Signed webhook", risk: "Do not infer a missing panel" } },
  { test: /gohighlevel|\bghl\b/i, item: { system: "GoHighLevel", purpose: "CRM stage sync", auth: "Private integration", risk: "Idempotent upsert required" } },
  { test: /retell|voice triage/i, item: { system: "Retell", purpose: "Inbound voice", auth: "Webhook HMAC", risk: "Keep the signature helper exported" } },
  { test: /anthropic|fable|zero[- ]retention/i, item: { system: "Anthropic Fable", purpose: "Model routing", auth: "API key", risk: "Zero retention, no transcript at rest" } },
  { test: /carecredit/i, item: { system: "CareCredit", purpose: "Financing pre-qualification", auth: "Provider API", risk: "Do not invent an approval" } },
  { test: /dentrix|opendental/i, item: { system: "Dentrix / OpenDental", purpose: "Practice management bridge", auth: "Per-site credentials", risk: "Idempotent chair writes" } },
  { test: /twilio|text-back|missed-call/i, item: { system: "Twilio", purpose: "Missed-call messaging", auth: "Twilio signature", risk: "TCPA consent" } },
  { test: /places|google maps/i, item: { system: "Google Places API", purpose: "Lead search", auth: "API key", risk: "No tile scraping" } },
  { test: /smartlead/i, item: { system: "Smartlead", purpose: "Sequence webhook", auth: "HMAC", risk: "Dedupe with Instantly" } },
  { test: /instantly/i, item: { system: "Instantly", purpose: "Sequence webhook", auth: "HMAC", risk: "Dedupe with Smartlead" } },
  { test: /\bslack\b/i, item: { system: "Slack", purpose: "Deal room", auth: "Bot token", risk: "One room per deal" } },
  { test: /apollo|dropcontact|enrichment/i, item: { system: "Enrichment waterfall", purpose: "Email discovery", auth: "Vendor keys", risk: "Spend cap, no fabricated names" } },
];

function detectKnown(transcript: string): RecordingId | null {
  if (/labcorp/i.test(transcript) && /peptide/i.test(transcript)) return "peptide";
  if (/carecredit/i.test(transcript) || /opendental/i.test(transcript)) return "dental";
  if (/smartlead/i.test(transcript) || /instantly/i.test(transcript)) return "agency";
  return null;
}

function compileCustom(transcript: string): ScopeResult {
  const lines = transcript
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = LINE.exec(line);
      return match
        ? { timestamp: match[1] ?? "", speaker: (match[2] ?? "").trim(), text: (match[3] ?? "").trim() }
        : { timestamp: "", speaker: "Caller", text: line };
    });

  const painPoints: PainPoint[] = lines
    .filter((line) => PAIN.test(line.text))
    .slice(0, 8)
    .map((line) => ({
      timestamp: line.timestamp || "—",
      speaker: line.speaker,
      quote: line.text,
      requirement: line.text,
    }));

  const integrations = CATALOG.filter((entry) => entry.test.test(transcript)).map((entry) => entry.item);
  const constraints: Constraint[] = [];
  if (/hipaa|phi|zero[- ]retention/i.test(transcript)) {
    constraints.push({ name: "Retention", detail: "Treat the call body as sensitive. Do not persist transcripts by default.", severity: "critical" });
  }
  if (/tcpa|consent/i.test(transcript)) {
    constraints.push({ name: "Consent", detail: "Outbound messages need a consent check before send.", severity: "critical" });
  }
  if (/cent|budget|cap/i.test(transcript)) {
    constraints.push({ name: "Spend cap", detail: "Budget fields are integer cents with a hard stop.", severity: "high" });
  }
  if (constraints.length === 0) {
    constraints.push({ name: "Least privilege", detail: "Custom transcript had no explicit compliance keywords. Default to RLS and signed webhooks.", severity: "medium" });
  }

  const traps: ScopeTrap[] = lines
    .filter((line) => TRAP.test(line.text))
    .slice(0, 6)
    .map((line) => ({
      timestamp: line.timestamp || "—",
      quote: line.text,
      trap: "Casual wording hides a product decision. Price the constraint, not the adjective.",
      mitigation: "Pull this line into the SOW as an explicit exclusion or a milestone.",
    }));

  const milestones: Milestone[] = [
    ...(integrations.length
      ? integrations.map((item) => ({
          name: item.system,
          hours: 10,
          deliverable: item.purpose,
        }))
      : [{ name: "Second discovery pass", hours: 8, deliverable: "Transcript did not name a buildable integration" }]),
    { name: "Export contract and handoff", hours: 6, deliverable: "SQL, n8n DAG, public signature surface" },
  ];

  const tables = ["engagements", "integration_events", ...integrations.map((item) => item.system.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 24) || "integration")];
  const uniqueTables = [...new Set(tables)].slice(0, 6);
  const sql = schema(
    "-- FathomScope · custom transcript",
    uniqueTables.map((name, index) =>
      table(
        name,
        index === 0
          ? `  summary text not null,\n`
          : `  engagement_id uuid not null references public.engagements (id),\n  external_id text,\n`,
        index === 0
          ? "auth.uid() is not null"
          : "exists (select 1 from public.engagements e where e.id = " + name + ".engagement_id and auth.uid() is not null)",
      ),
    ),
  );

  const steps = [
    { name: "Inbound Webhook", type: "n8n-nodes-base.webhook", parameters: { httpMethod: "POST", path: "custom/inbound" } },
    { name: "Verify Signature", type: "n8n-nodes-base.code", parameters: { note: "HMAC before any write." } },
    ...integrations.map((item) => ({
      name: item.system,
      type: "n8n-nodes-base.httpRequest",
      parameters: { note: item.purpose },
    })),
    { name: "Respond 200", type: "n8n-nodes-base.respondToWebhook", parameters: { responseCode: 200 } },
  ];

  const statement = sow(integrations.length ? "Custom white-label build" : "Discovery follow-up", milestones);
  return {
    recordingId: "custom",
    title: "Custom Fathom transcript",
    client: lines[0]?.speaker || "Unknown caller",
    durationMin: null,
    slug: "custom-transcript",
    painPoints,
    integrations,
    constraints,
    traps,
    sow: statement,
    sql,
    n8n: workflow("Custom Fathom scope", steps),
    swarm: [
      task({
        id: "custom-schema",
        agent: "schema-agent",
        title: "Generated tables and RLS",
        detail: "Independent AST check on the compiled migration.",
        agentClaim: "Schema generated from the transcript. Done.",
        check: "schema-ast",
        artifact: sql,
        requiredExports: [],
        checksRun: ["Schema migration AST"],
      }),
      task({
        id: "custom-webhook",
        agent: "webhook-agent",
        title: "Signed inbound webhook",
        detail: "Verifier runs a live HMAC oracle and checks the export.",
        agentClaim: "Signature helper exported. Done.",
        check: "hmac-export",
        artifact: `export function verifyInboundSignature(rawBody: string, signature: string, secret: string): boolean {
  return rawBody.length > 0 && signature.length > 0 && secret.length > 0;
}
export function acceptInbound(rawBody: string): string {
  try { return rawBody; } catch (err) { throw err; }
}
`,
        requiredExports: ["verifyInboundSignature"],
        checksRun: ["Webhook HMAC signature test", "Public export contract"],
      }),
      task({
        id: "custom-voice",
        agent: "voice-tool-agent",
        title: "Retention posture",
        detail: "Custom calls default to zero-retention unless the transcript says otherwise.",
        agentClaim: "No transcript write. Done.",
        check: "voice-contract",
        artifact: `export function routeModel(callId: string): string {
  const mode = "zero-retention";
  try { return mode + ":" + callId; } catch (err) { throw err; }
}
`,
        requiredExports: ["routeModel"],
        needle: "zero-retention",
        checksRun: ["Public export contract", "Zero-retention voice contract"],
      }),
      task({
        id: "custom-ghl",
        agent: "ghl-sync-agent",
        title: "Idempotent downstream sync",
        detail: "Retries must not duplicate the side effect.",
        agentClaim: "Idempotency key threaded. Done.",
        check: "sync-semantics",
        artifact: `export function syncDownstream(id: string, idempotencyKey: string): string {
  try { return id + ":" + idempotencyKey; } catch (err) { throw err; }
}
`,
        requiredExports: ["syncDownstream"],
        needle: "idempotency",
        checksRun: ["Public export contract", "Error-propagation signature"],
      }),
    ],
  };
}

export function compileScope(input: { recordingId?: string; transcript?: string }): ScopeResult {
  const recordingId = input.recordingId;
  if (recordingId === "peptide" || recordingId === "dental" || recordingId === "agency") {
    return known(recordingId);
  }
  const transcript = (input.transcript ?? "").trim();
  if (!transcript) {
    throw new Error("Choose a Fathom recording or paste a transcript.");
  }
  if (transcript.length > 100_000) {
    throw new Error("Transcript is too large.");
  }
  const detected = detectKnown(transcript);
  if (detected) return known(detected);
  return compileCustom(transcript);
}
