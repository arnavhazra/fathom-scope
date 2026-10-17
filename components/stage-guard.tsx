"use client";

import { useEffect, useState } from "react";
import { GitPullRequest } from "lucide-react";

import { GUARD_PRESETS, MAIN_FILE, type GuardPreset } from "@/lib/presets";
import type { AgentCi, GuardReport } from "@/lib/types";

type GuardResponse = GuardReport & {
  branchName: string | null;
  agentCi: AgentCi | null;
};

async function runDiff(preset: GuardPreset, main: string, branch: string): Promise<GuardResponse> {
  const response = await fetch("/api/guard/diff", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      main,
      branch,
      branchName: preset.branch,
      agentCi: preset.agentCi,
    }),
  });
  const payload = (await response.json()) as GuardResponse & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "Diff gate failed.");
  }
  return payload;
}

export function StageGuard() {
  const [presetId, setPresetId] = useState(GUARD_PRESETS[0]!.id);
  const preset = GUARD_PRESETS.find((item) => item.id === presetId) ?? GUARD_PRESETS[0]!;
  const [main, setMain] = useState(preset.main);
  const [branch, setBranch] = useState(preset.source);
  const [report, setReport] = useState<GuardResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function execute(nextPreset: GuardPreset, nextMain: string, nextBranch: string) {
    setRunning(true);
    setError(null);
    try {
      setReport(await runDiff(nextPreset, nextMain, nextBranch));
    } catch (cause) {
      setReport(null);
      setError(cause instanceof Error ? cause.message : "Diff gate failed.");
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    void execute(GUARD_PRESETS[0]!, GUARD_PRESETS[0]!.main, GUARD_PRESETS[0]!.source);
  }, []);

  function selectPreset(next: GuardPreset) {
    setPresetId(next.id);
    setMain(next.main);
    setBranch(next.source);
    void execute(next, next.main, next.source);
  }

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-line bg-panel p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ice">Joe Brennan · Hermes / Paperclip</p>
        <h2 className="mt-2 text-xl font-semibold">Public export & error-semantics diff</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
          A swarm deleted public API because nothing inside the repo called it. Other people&apos;s plugins did. Tests passed anyway. The same run changed how errors get handled in dozens of places. Tests missed that too. Before an agent branch opens a PR, this gate diffs public exports against main and fingerprints every catch.
        </p>
      </div>

      <div className="grid gap-2 lg:grid-cols-3">
        {GUARD_PRESETS.map((item) => {
          const active = item.id === preset.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => selectPreset(item)}
              className={`rounded-xl border p-3 text-left ${active ? "border-lime bg-lime/5" : "border-line bg-panel hover:border-ink/30"}`}
            >
              <p className="font-mono text-[11px] text-lime">{item.branch}</p>
              <p className="mt-2 text-sm leading-5">{item.summary}</p>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-muted">
                Agent CI {item.agentCi.passed}/{item.agentCi.total} PASS
              </p>
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Editor label={`main · ${MAIN_FILE}`} value={main} onChange={setMain} />
        <Editor label={`HEAD · ${preset.branch}`} value={branch} onChange={setBranch} />
      </div>

      <button
        type="button"
        onClick={() => void execute(preset, main, branch)}
        disabled={running}
        className="inline-flex items-center gap-2 rounded-lg bg-lime px-4 py-3 text-sm font-semibold text-bg disabled:opacity-50"
      >
        <GitPullRequest size={16} aria-hidden />
        {running ? "Parsing AST…" : "Run Public Export & Error-Handler Diff Gate"}
      </button>
      {error ? <p className="text-sm text-coral">{error}</p> : null}

      {report ? (
        <div className="rounded-xl border border-line bg-panel p-4" aria-live="polite">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className={`stamp ${report.decision === "BLOCKED" ? "text-coral" : "text-mint"}`}>{report.decision}</p>
              <p className="mt-4 max-w-xl text-sm leading-6">{report.headline}</p>
              {report.agentCi ? (
                <p className="mt-2 font-mono text-xs text-lime">
                  Unit tests {report.agentCi.passed}/{report.agentCi.total} PASS. The gate does not read that number.
                </p>
              ) : null}
            </div>
            <dl className="grid grid-cols-2 gap-2 text-right sm:grid-cols-4">
              <Count label="Exports removed" value={report.publicExportsRemoved} hot={report.publicExportsRemoved > 0} />
              <Count label="Catches mutated" value={report.errorHandlingSignaturesMutated} hot={report.errorHandlingSignaturesMutated > 0} />
              <Count label="Exports preserved" value={report.publicExportsPreserved} hot={false} />
              <Count label="Exports added" value={report.publicExportsAdded} hot={false} />
            </dl>
          </div>
          <p className="mt-4 font-mono text-[11px] text-muted">
            AST · main {report.mainExportCount} exports / {report.mainCatchCount} catches · branch {report.branchExportCount} exports / {report.branchCatchCount} catches
          </p>

          <div className="mt-4 overflow-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead className="font-mono text-[10px] uppercase tracking-wider text-muted">
                <tr>
                  <th className="py-2 font-normal">Symbol</th>
                  <th className="py-2 font-normal">Kind</th>
                  <th className="py-2 font-normal">Contract</th>
                </tr>
              </thead>
              <tbody>
                {report.exports.map((row) => (
                  <tr key={`${row.status}-${row.kind}-${row.name}`} className="border-t border-line">
                    <td className="py-2 font-mono text-xs">{row.name}</td>
                    <td className="py-2 font-mono text-xs text-muted">{row.kind}</td>
                    <td className={`py-2 font-mono text-xs uppercase ${row.status === "removed" ? "text-coral" : row.status === "added" ? "text-ice" : "text-mint"}`}>
                      {row.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {report.errorMutations.length ? (
            <div className="mt-4 overflow-auto">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead className="font-mono text-[10px] uppercase tracking-wider text-muted">
                  <tr>
                    <th className="py-2 font-normal">Catch site</th>
                    <th className="py-2 font-normal">Main</th>
                    <th className="py-2 font-normal">Branch</th>
                  </tr>
                </thead>
                <tbody>
                  {report.errorMutations.map((mutation) => (
                    <tr key={mutation.key} className="border-t border-line">
                      <td className="py-2 font-mono text-xs">{mutation.key}</td>
                      <td className="py-2 font-mono text-xs text-mint">{mutation.before}</td>
                      <td className="py-2 font-mono text-xs text-coral">{mutation.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 text-sm text-mint">No catch-site signature changed relative to main.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}

function Editor({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block rounded-xl border border-line bg-panel">
      <span className="block border-b border-line px-3 py-2 font-mono text-[11px] text-muted">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        className="h-[28rem] w-full resize-y bg-transparent p-3 font-mono text-[11px] leading-5 text-ink outline-none"
      />
    </label>
  );
}

function Count({ label, value, hot }: { label: string; value: number; hot: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-bg px-3 py-2">
      <dt className="font-mono text-[10px] uppercase tracking-wider text-muted">{label}</dt>
      <dd className={`font-mono text-2xl ${hot ? "text-coral" : "text-ink"}`}>{value}</dd>
    </div>
  );
}
