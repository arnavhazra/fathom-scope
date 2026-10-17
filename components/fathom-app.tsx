"use client";

import { useState } from "react";
import { GitPullRequest, Mic, Shield } from "lucide-react";

import { StageGuard } from "@/components/stage-guard";
import { StageIngest } from "@/components/stage-ingest";
import { StageSwarm } from "@/components/stage-swarm";
import type { ScopeResult } from "@/lib/types";
import type { RecordingId } from "@/lib/types";

const STAGES = [
  { id: 1 as const, label: "Ingest", hint: "Fathom call", icon: Mic },
  { id: 2 as const, label: "Swarm", hint: "External gate", icon: Shield },
  { id: 3 as const, label: "ExportGuard", hint: "PR diff", icon: GitPullRequest },
];

export function FathomApp() {
  const [stage, setStage] = useState<1 | 2 | 3>(1);
  const [recordingId, setRecordingId] = useState<RecordingId | "custom">("peptide");
  const [customText, setCustomText] = useState("");
  const [compiling, setCompiling] = useState(false);
  const [scope, setScope] = useState<ScopeResult | null>(null);
  const [compileError, setCompileError] = useState<string | null>(null);

  async function compile() {
    setCompiling(true);
    setCompileError(null);
    try {
      const response = await fetch("/api/scope/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          recordingId === "custom" ? { transcript: customText } : { recordingId, transcript: customText },
        ),
      });
      const payload = (await response.json()) as ScopeResult & { error?: string };
      if (!response.ok) {
        setScope(null);
        setCompileError(payload.error ?? "Compile failed.");
        return;
      }
      setScope(payload);
    } catch {
      setCompileError("The scope compiler did not respond.");
    } finally {
      setCompiling(false);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line/80 bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-md bg-lime font-mono text-sm font-bold text-bg">
              FS
            </span>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">AI Frontrunners</p>
              <p className="text-sm font-semibold leading-tight">FathomScope & ExportGuard</p>
            </div>
          </div>
          <nav className="flex flex-1 justify-center gap-1" aria-label="Workflow stages">
            {STAGES.map((item) => {
              const Icon = item.icon;
              const active = stage === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setStage(item.id)}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-left text-sm transition ${
                    active ? "border-lime/70 bg-lime/10 text-ink" : "border-transparent text-muted hover:border-line hover:text-ink"
                  }`}
                >
                  <span className="font-mono text-[10px] text-lime">0{item.id}</span>
                  <Icon size={14} aria-hidden />
                  <span className="font-medium">{item.label}</span>
                  <span className="hidden font-mono text-[10px] uppercase tracking-wider text-muted sm:inline">{item.hint}</span>
                </button>
              );
            })}
          </nav>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">No login · 3 modules</p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <section className="mb-6 max-w-3xl">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Discovery call in. Guarded architecture out.
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted sm:text-base">
            Tim Chao records the client on Fathom and hands the build to a white-label lane. Joe Brennan&apos;s rule sits on the other end: an agent branch cannot open a PR if a public export disappeared. This desk runs both.
          </p>
        </section>

        {stage === 1 ? (
          <StageIngest
            recordingId={recordingId}
            customText={customText}
            compiling={compiling}
            scope={scope}
            error={compileError}
            onRecording={setRecordingId}
            onCustomText={setCustomText}
            onCompile={() => void compile()}
            onReviewSwarm={() => setStage(2)}
          />
        ) : null}
        {stage === 2 ? <StageSwarm scope={scope} onCompileFirst={() => setStage(1)} /> : null}
        {stage === 3 ? <StageGuard /> : null}
      </main>
    </div>
  );
}
