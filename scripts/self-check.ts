import { compileScope } from "../lib/compile-scope";
import { diffContract, extractErrorSites, extractExports, tokenize } from "../lib/export-guard";
import { GUARD_PRESETS } from "../lib/presets";
import { RECORDINGS } from "../lib/transcripts";
import { verifySwarm } from "../lib/verify";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const main = GUARD_PRESETS[0]?.main;
assert(main, "missing main");
const mainExports = extractExports(tokenize(main)).map((item) => `${item.kind}:${item.name}`);
assert(
  mainExports.join(",") ===
    [
      "const:FATHOM_SCOPE_CONTRACT_VERSION",
      "type:ClinicWebhookPayload",
      "interface:BudgetCap",
      "function:verifyRetellSignature",
      "function:routeZeroRetentionModel",
      "function:ingestLabcorpWebhook",
      "function:applyCentBudget",
    ].join(","),
  `unexpected main exports: ${mainExports.join(", ")}`,
);
const mainSites = extractErrorSites(tokenize(main)).map((site) => `${site.key}:${site.behavior}`);
assert(
  mainSites.join(",") ===
    "routeZeroRetentionModel#0:wrap-and-throw,ingestLabcorpWebhook#0:rethrow,applyCentBudget#0:rethrow",
  `unexpected main catches: ${mainSites.join(", ")}`,
);

const blocked = diffContract(main, GUARD_PRESETS[0]!.source);
assert(blocked.decision === "BLOCKED", blocked.headline);
assert(blocked.publicExportsRemoved === 2, `removed ${blocked.publicExportsRemoved}`);
assert(blocked.errorHandlingSignaturesMutated === 3, `mutated ${blocked.errorHandlingSignaturesMutated} ${JSON.stringify(blocked.errorMutations)}`);
const removed = blocked.exports.filter((row) => row.status === "removed").map((row) => row.name).sort();
assert(removed.join(",") === "ClinicWebhookPayload,verifyRetellSignature", removed.join(","));
assert(!blocked.exports.some((row) => row.name === "commentGhost" || row.name === "ghostTpl" || row.name === "NotReal"), "decoy exported");

const approved = diffContract(main, GUARD_PRESETS[1]!.source);
assert(approved.decision === "APPROVED", `${approved.headline} ${JSON.stringify(approved.errorMutations)}`);
assert(approved.publicExportsRemoved === 0, "branch 2 removed exports");
assert(approved.errorHandlingSignaturesMutated === 0, "branch 2 mutated errors");
assert(approved.exports.some((row) => row.name === "retryGhlCalendarSync" && row.status === "added"), "retry not added");

const quiet = diffContract(main, GUARD_PRESETS[2]!.source);
assert(quiet.decision === "BLOCKED", quiet.headline);
assert(quiet.publicExportsRemoved === 0, `quiet removed ${quiet.publicExportsRemoved}`);
assert(quiet.errorHandlingSignaturesMutated === 3, `quiet mutated ${quiet.errorHandlingSignaturesMutated}`);

const same = diffContract(main, main);
assert(same.decision === "APPROVED" && same.publicExportsRemoved === 0 && same.errorHandlingSignaturesMutated === 0, "identical sources should pass");

const expectedGate: Record<string, Array<"PASS" | "FAIL">> = {
  peptide: ["PASS", "FAIL", "PASS", "PASS"],
  dental: ["PASS", "PASS", "PASS", "FAIL"],
  agency: ["PASS", "PASS", "FAIL", "PASS"],
};

for (const recording of RECORDINGS) {
  const scope = compileScope({ recordingId: recording.id });
  assert(scope.painPoints.length >= 4, `${recording.id} pain`);
  assert(scope.integrations.length >= 4, `${recording.id} integrations`);
  assert(scope.constraints.length >= 3, `${recording.id} constraints`);
  assert(scope.traps.length >= 2, `${recording.id} traps`);
  assert(scope.sow.marginPct === 51, `${recording.id} margin ${scope.sow.marginPct}`);
  assert(scope.sow.agencyPrice - scope.sow.devPayout === scope.sow.grossMargin, "margin math");
  assert(scope.n8n.nodes.length >= 5, "n8n nodes");
  assert(scope.swarm.length === 4, "swarm size");
  const gates = verifySwarm(scope.swarm);
  const got = gates.map((gate) => gate.gate).join(",");
  const want = expectedGate[recording.id]?.join(",");
  assert(got === want, `${recording.id} gates ${got} !== ${want}\n${gates.map((gate) => gate.evidence.join(" | ")).join("\n")}`);
}

const custom = compileScope({
  transcript: "[00:10] Ada: We need a webhook into the CRM.\n[02:00] Ada: Just scrape the directory, it is simple.",
});
assert(custom.recordingId === "custom", "custom id");
assert(custom.painPoints.length >= 1, "custom pain");
assert(custom.traps.length >= 1, "custom traps");
assert(verifySwarm(custom.swarm).every((gate) => gate.gate === "PASS"), "custom gates");

const pasted = compileScope({
  transcript: RECORDINGS[0]!.transcript,
});
assert(pasted.recordingId === "peptide", "pasted peptide should detect");

console.log("fathom-scope self-check ok");
