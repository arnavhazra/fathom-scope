"use client";

import { useEffect, useState } from "react";
import { Bot, ShieldCheck, ShieldX } from "lucide-react";

import type { GateEvidence, ScopeResult } from "@/lib/types";

export function StageSwarm({ scope, onCompileFirst }: { scope: ScopeResult | null; onCompileFirst: () => void }) {
  const [results, setResults] = useState<GateEvidence[] | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(current: ScopeResult) {
    setRunning(true);
    setError(null);
    try {
      const response = await fetch("/api/swarm/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tasks: current.swarm }),
      });
      const payload = (await response.json()) as { results?: GateEvidence[]; error?: string };
      if (!response.ok || !payload.results) {
        setResults(null);
        setError(payload.error ?? "Verifier failed.");
        return;
      }
      setResults(payload.results);
    } catch {
      setError("Independent verifier did not respond.");
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    if (!scope) {
      setResults(null);
      return;
    }
    void run(scope);
    // Re-run only when a new compiled scope arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  if (!scope) {
    return (
      <section className="rounded-xl border border-line bg-panel p-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">Stage 02</p>
        <h2 className="mt-2 text-2xl font-semibold">No swarm loaded.</h2>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Compile a Fathom recording first. The four agents only appear with the artifacts that scope produced.
        </p>
        <button type="button" onClick={onCompileFirst} className="mt-4 rounded-lg bg-lime px-4 py-2 text-sm font-semibold text-bg">
          Back to ingest
        </button>
      </section>
    );
  }

  const failed = results?.filter((item) => item.gate === "FAIL").length ?? 0;

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-amber/40 bg-amber/10 p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-amber">Verification rule</p>
        <h2 className="mt-1 text-xl font-semibold">Agents cannot mark their own task done.</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/80">
          Every lane below already filed <span className="font-mono text-lime">Agent Self-Report: DONE</span>. The independent verifier re-parses the schema AST, runs a live HMAC oracle, and checks the public export contract. The self-report is not an input.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-xs text-muted">
          {scope.title} · {results ? `${failed} gate${failed === 1 ? "" : "s"} failed` : "verifier queued"}
        </p>
        <button
          type="button"
          onClick={() => void run(scope)}
          disabled={running}
          className="rounded-lg border border-line px-3 py-2 text-sm hover:border-lime disabled:opacity-50"
        >
          {running ? "Running verifier…" : "Run Independent Verifier Gate"}
        </button>
      </div>
      {error ? <p className="text-sm text-coral">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {scope.swarm.map((task) => {
          const gate = results?.find((item) => item.id === task.id);
          return (
            <article key={task.id} className="rounded-xl border border-line bg-panel p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-ice">
                    <Bot size={14} aria-hidden />
                    {task.agent}
                  </p>
                  <h3 className="mt-1 font-semibold">{task.title}</h3>
                  <p className="mt-1 text-sm text-muted">{task.detail}</p>
                </div>
                {gate ? (
                  gate.gate === "PASS" ? (
                    <ShieldCheck className="shrink-0 text-mint" aria-label="Pass" />
                  ) : (
                    <ShieldX className="shrink-0 text-coral" aria-label="Fail" />
                  )
                ) : null}
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-line bg-bg p-3">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted">Agent self-report</p>
                  <p className="mt-1 font-mono text-sm text-lime">DONE</p>
                  <p className="mt-2 text-xs leading-5 text-muted">{task.agentClaim}</p>
                </div>
                <div className="rounded-lg border border-line bg-bg p-3">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted">Independent verifier gate</p>
                  <p className={`mt-1 font-mono text-sm ${gate?.gate === "FAIL" ? "text-coral" : gate ? "text-mint" : "text-muted"}`}>
                    {running && !gate ? "RUNNING" : (gate?.gate ?? "PENDING")}
                  </p>
                  <p className="mt-2 text-xs text-muted">{task.checksRun.join(" · ")}</p>
                </div>
              </div>

              {gate ? (
                <ul className="mt-3 space-y-1.5">
                  {gate.evidence.map((line) => (
                    <li key={line} className="font-mono text-[11px] leading-5 text-ink/80">
                      {line}
                    </li>
                  ))}
                </ul>
              ) : null}

              <details className="mt-3">
                <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-wider text-muted">Artifact</summary>
                <pre className="mt-2 max-h-56 overflow-auto rounded-lg border border-line bg-bg p-3 font-mono text-[11px] leading-5">
                  {task.artifact}
                </pre>
              </details>
            </article>
          );
        })}
      </div>
    </section>
  );
}
