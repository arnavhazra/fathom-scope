export type RecordingId = "peptide" | "dental" | "agency";

export interface PainPoint {
  timestamp: string;
  speaker: string;
  quote: string;
  requirement: string;
}

export interface Integration {
  system: string;
  purpose: string;
  auth: string;
  risk: string;
}

export interface Constraint {
  name: string;
  detail: string;
  severity: "critical" | "high" | "medium";
}

export interface ScopeTrap {
  timestamp: string;
  quote: string;
  trap: string;
  mitigation: string;
}

export interface Milestone {
  name: string;
  hours: number;
  deliverable: string;
}

export interface Sow {
  title: string;
  billRate: number;
  payoutRate: number;
  milestones: Milestone[];
  totalHours: number;
  agencyPrice: number;
  devPayout: number;
  grossMargin: number;
  marginPct: number;
}

export type AgentName =
  | "schema-agent"
  | "webhook-agent"
  | "voice-tool-agent"
  | "ghl-sync-agent";

export type SwarmCheck = "schema-ast" | "hmac-export" | "voice-contract" | "sync-semantics";

export interface SwarmTask {
  id: string;
  agent: AgentName;
  title: string;
  detail: string;
  selfReport: "DONE";
  agentClaim: string;
  check: SwarmCheck;
  artifact: string;
  requiredExports: string[];
  needle?: string;
  checksRun: string[];
}

export interface N8nWorkflow {
  name: string;
  nodes: Array<Record<string, unknown>>;
  connections: Record<string, unknown>;
  pinData: Record<string, unknown>;
  active: boolean;
  settings: { executionOrder: string };
  meta: Record<string, unknown>;
  tags: string[];
}

export interface ScopeResult {
  recordingId: RecordingId | "custom";
  title: string;
  client: string;
  durationMin: number | null;
  slug: string;
  painPoints: PainPoint[];
  integrations: Integration[];
  constraints: Constraint[];
  traps: ScopeTrap[];
  sow: Sow;
  sql: string;
  n8n: N8nWorkflow;
  swarm: SwarmTask[];
}

export interface GateEvidence {
  id: string;
  gate: "PASS" | "FAIL";
  evidence: string[];
}

export type ExportKind = "function" | "const" | "type" | "interface" | "class" | "enum";

export interface ExportRow {
  name: string;
  kind: ExportKind;
  status: "preserved" | "removed" | "added";
}

export interface ErrorMutation {
  key: string;
  enclosing: string;
  before: string;
  after: string;
}

export interface GuardReport {
  decision: "APPROVED" | "BLOCKED";
  headline: string;
  publicExportsRemoved: number;
  errorHandlingSignaturesMutated: number;
  publicExportsAdded: number;
  publicExportsPreserved: number;
  exports: ExportRow[];
  errorMutations: ErrorMutation[];
  mainExportCount: number;
  branchExportCount: number;
  mainCatchCount: number;
  branchCatchCount: number;
}

export interface AgentCi {
  passed: number;
  total: number;
}
