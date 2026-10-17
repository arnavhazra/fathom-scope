"use client";

import { useState, type ReactNode } from "react";
import { AlertTriangle, Database, Download, FileJson, Scale } from "lucide-react";

import { RECORDINGS } from "@/lib/transcripts";
import type { RecordingId, ScopeResult } from "@/lib/types";

type Tab = "pain" | "integrations" | "constraints" | "traps" | "sow" | "sql" | "n8n";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "pain", label: "Pain points" },
  { id: "integrations", label: "Integrations" },
  { id: "constraints", label: "Constraints" },
  { id: "traps", label: "Scope traps" },
  { id: "sow", label: "SOW" },
  { id: "sql", label: "SQL" },
  { id: "n8n", label: "n8n DAG" },
];

function usd(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function download(filename: string, contents: string, type: string) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function Transcript({ text }: { text: string }) {
  const lines = text.split("\n").filter((line) => line.trim());
  return (
    <ol className="max-h-[32rem] space-y-3 overflow-auto pr-1">
      {lines.map((line, index) => {
        const match = /^\[(\d{1,2}:\d{2})\]\s*([^:]+):\s*(.*)$/.exec(line);
        if (!match) {
          return (
            <li key={index} className="text-sm text-muted">
              {line}
            </li>
          );
        }
        return (
          <li key={index} className="grid grid-cols-[3.4rem_1fr] gap-3 text-sm leading-6">
            <span className="font-mono text-[11px] text-lime">{match[1]}</span>
            <p>
              <span className="font-medium text-ice">{match[2]}</span>
              <span className="text-ink/90"> {match[3]}</span>
            </p>
          </li>
        );
      })}
    </ol>
  );
}

export function StageIngest({
  recordingId,
  customText,
  compiling,
  scope,
  error,
  onRecording,
  onCustomText,
  onCompile,
  onReviewSwarm,
}: {
  recordingId: RecordingId | "custom";
  customText: string;
  compiling: boolean;
  scope: ScopeResult | null;
  error: string | null;
  onRecording: (id: RecordingId | "custom") => void;
  onCustomText: (value: string) => void;
  onCompile: () => void;
  onReviewSwarm: () => void;
}) {
  const [tab, setTab] = useState<Tab>("pain");
  const selected = RECORDINGS.find((recording) => recording.id === recordingId);
  const transcript = recordingId === "custom" ? customText : (selected?.transcript ?? "");

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        {RECORDINGS.map((recording) => {
          const active = recordingId === recording.id;
          return (
            <button
              key={recording.id}
              type="button"
              onClick={() => onRecording(recording.id)}
              className={`rounded-xl border p-4 text-left transition ${
                active ? "border-lime bg-lime/5" : "border-line bg-panel hover:border-ink/30"
              }`}
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-lime">{recording.kicker}</p>
              <p className="mt-2 font-semibold">{recording.title}</p>
              <p className="mt-1 text-sm text-muted">{recording.client}</p>
              <p className="mt-3 text-xs leading-5 text-ink/80">{recording.summary}</p>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="rounded-xl border border-line bg-panel p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">Fathom transcript</h2>
            <button
              type="button"
              onClick={() => onRecording("custom")}
              className={`rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-wider ${
                recordingId === "custom" ? "border-lime text-lime" : "border-line text-muted"
              }`}
            >
              Paste custom
            </button>
          </div>
          {recordingId === "custom" ? (
            <textarea
              value={customText}
              onChange={(event) => onCustomText(event.target.value)}
              spellCheck={false}
              placeholder={"[00:12] Client: We need a webhook into the CRM.\n[02:40] Client: Just scrape it, should be simple."}
              className="h-80 w-full resize-y rounded-lg border border-line bg-bg p-3 font-mono text-xs leading-5 text-ink outline-none"
            />
          ) : (
            <Transcript text={transcript} />
          )}
          <button
            type="button"
            onClick={onCompile}
            disabled={compiling || (recordingId === "custom" && customText.trim().length === 0)}
            className="mt-4 w-full rounded-lg bg-lime px-4 py-3 text-sm font-semibold text-bg disabled:cursor-not-allowed disabled:opacity-50"
          >
            {compiling ? "Compiling…" : "Compile Technical Scope & Architecture (/api/scope/compile)"}
          </button>
          {error ? <p className="mt-3 text-sm text-coral">{error}</p> : null}
        </section>

        <section className="rounded-xl border border-line bg-panel p-4">
          {!scope ? (
            <div className="flex h-full min-h-80 flex-col justify-between">
              <div>
                <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">Compiler output</h2>
                <p className="mt-3 text-lg font-semibold">Waiting on a Fathom recording.</p>
                <ul className="mt-4 space-y-2 text-sm text-muted">
                  <li>Timestamped pain points and the requirement hiding inside them.</li>
                  <li>API integrations, auth, and the failure mode that actually costs money.</li>
                  <li>Fixed-margin SOW at $200 agency / $98 white-label, 51% gross.</li>
                  <li>Supabase SQL with RLS, plus an n8n workflow JSON you can import.</li>
                </ul>
              </div>
              <p className="font-mono text-[11px] text-muted">POST /api/scope/compile</p>
            </div>
          ) : (
            <div>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-lime">{scope.client}</p>
                  <h2 className="text-xl font-semibold">{scope.title}</h2>
                  <p className="mt-1 font-mono text-xs text-muted">
                    {scope.durationMin ? `${scope.durationMin} min` : "custom"} · {scope.sow.totalHours}h · {usd(scope.sow.grossMargin)} margin
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onReviewSwarm}
                  className="rounded-lg border border-line px-3 py-2 text-sm hover:border-lime"
                >
                  Review swarm gates
                </button>
              </div>
              <div className="mt-4 flex gap-1 overflow-auto">
                {TABS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTab(item.id)}
                    className={`shrink-0 rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-wider ${
                      tab === item.id ? "bg-ink text-bg" : "text-muted hover:text-ink"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="mt-4">
                {tab === "pain" ? (
                  <ul className="space-y-3">
                    {scope.painPoints.map((point) => (
                      <li key={`${point.timestamp}-${point.requirement}`} className="rounded-lg border border-line bg-panel-2 p-3">
                        <p className="font-mono text-[11px] text-lime">
                          {point.timestamp} · {point.speaker}
                        </p>
                        <p className="mt-1 text-sm text-muted">&ldquo;{point.quote}&rdquo;</p>
                        <p className="mt-2 text-sm">{point.requirement}</p>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {tab === "integrations" ? (
                  <ul className="space-y-3">
                    {scope.integrations.map((item) => (
                      <li key={item.system} className="rounded-lg border border-line p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-semibold">{item.system}</p>
                          <p className="font-mono text-[10px] uppercase tracking-wider text-ice">{item.auth}</p>
                        </div>
                        <p className="mt-1 text-sm">{item.purpose}</p>
                        <p className="mt-2 text-sm text-amber">{item.risk}</p>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {tab === "constraints" ? (
                  <ul className="space-y-3">
                    {scope.constraints.map((item) => (
                      <li key={item.name} className="rounded-lg border border-line p-3">
                        <p className="font-mono text-[10px] uppercase tracking-wider text-coral">{item.severity}</p>
                        <p className="mt-1 font-semibold">{item.name}</p>
                        <p className="mt-1 text-sm text-muted">{item.detail}</p>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {tab === "traps" ? (
                  <ul className="space-y-3">
                    {scope.traps.map((trap) => (
                      <li key={trap.timestamp + trap.quote} className="rounded-lg border border-coral/40 bg-coral/5 p-3">
                        <p className="flex items-center gap-2 font-mono text-[11px] text-coral">
                          <AlertTriangle size={14} aria-hidden />
                          {trap.timestamp}
                        </p>
                        <p className="mt-2 text-sm">&ldquo;{trap.quote}&rdquo;</p>
                        <p className="mt-2 text-sm text-muted">{trap.trap}</p>
                        <p className="mt-2 text-sm text-mint">{trap.mitigation}</p>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {tab === "sow" ? (
                  <div>
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
                          <Scale size={14} aria-hidden /> Fixed-margin white-label SOW
                        </p>
                        <p className="mt-1 text-lg font-semibold">{scope.sow.title}</p>
                      </div>
                      <p className="font-mono text-sm text-lime">{scope.sow.marginPct}% gross</p>
                    </div>
                    <div className="ledger-bar mt-3">
                      <div className="bg-ice" title="White-label payout" />
                      <div className="bg-lime" title="Agency margin" />
                    </div>
                    <div className="mt-2 flex justify-between font-mono text-[11px] text-muted">
                      <span>Payout {usd(scope.sow.devPayout)}</span>
                      <span>Margin {usd(scope.sow.grossMargin)}</span>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                      <Stat label="Agency price" value={usd(scope.sow.agencyPrice)} detail={`$${scope.sow.billRate}/h`} />
                      <Stat label="Dev payout" value={usd(scope.sow.devPayout)} detail={`$${scope.sow.payoutRate}/h`} />
                      <Stat label="Gross margin" value={usd(scope.sow.grossMargin)} detail={`${scope.sow.totalHours} hours`} />
                    </div>
                    <table className="mt-4 w-full text-left text-sm">
                      <thead className="font-mono text-[10px] uppercase tracking-wider text-muted">
                        <tr>
                          <th className="py-2 font-normal">Milestone</th>
                          <th className="py-2 font-normal">Hours</th>
                          <th className="py-2 text-right font-normal">Agency</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scope.sow.milestones.map((milestone) => (
                          <tr key={milestone.name} className="border-t border-line">
                            <td className="py-2 pr-3">
                              <p>{milestone.name}</p>
                              <p className="text-xs text-muted">{milestone.deliverable}</p>
                            </td>
                            <td className="py-2 font-mono">{milestone.hours}</td>
                            <td className="py-2 text-right font-mono">{usd(milestone.hours * scope.sow.billRate)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
                {tab === "sql" ? (
                  <CodeBlock
                    icon={<Database size={14} aria-hidden />}
                    label="Supabase SQL · CREATE TABLE + RLS"
                    text={scope.sql}
                    onDownload={() => download(`${scope.slug}-schema.sql`, scope.sql, "application/sql")}
                  />
                ) : null}
                {tab === "n8n" ? (
                  <CodeBlock
                    icon={<FileJson size={14} aria-hidden />}
                    label="n8n workflow DAG"
                    text={JSON.stringify(scope.n8n, null, 2)}
                    onDownload={() =>
                      download(`${scope.slug}-n8n.json`, JSON.stringify(scope.n8n, null, 2), "application/json")
                    }
                  />
                ) : null}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border border-line bg-bg px-2 py-3">
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
      <p className="font-mono text-[10px] text-muted">{detail}</p>
    </div>
  );
}

function CodeBlock({
  icon,
  label,
  text,
  onDownload,
}: {
  icon: ReactNode;
  label: string;
  text: string;
  onDownload: () => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted">
          {icon}
          {label}
        </p>
        <button
          type="button"
          onClick={onDownload}
          className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 font-mono text-[10px] uppercase tracking-wider hover:border-lime"
        >
          <Download size={12} aria-hidden />
          Download
        </button>
      </div>
      <pre className="max-h-96 overflow-auto rounded-lg border border-line bg-bg p-3 font-mono text-[11px] leading-5 text-ink/90">{text}</pre>
    </div>
  );
}
