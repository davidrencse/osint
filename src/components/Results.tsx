"use client";

import { useState } from "react";
import type { Entity, Finding, InvestigationResult, Severity } from "@/lib/osint/types";
import { Profile } from "./Profile";
import { MapView } from "./MapView";

// monochrome severity markers
const sevMark: Record<Severity, string> = {
  info: "·",
  low: "▸",
  medium: "▴",
  high: "■",
};

function Pill({ e }: { e: Entity }) {
  return (
    <span
      title={`${e.source} · ${(e.confidence * 100).toFixed(0)}%`}
      className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-panel-2 px-2 py-1 text-[11px]"
    >
      <span className="text-muted">{e.type}</span>
      <span className="text-foreground">{e.label && e.label !== e.value ? e.label : e.value}</span>
    </span>
  );
}

function Value({ v }: { v: unknown }) {
  if (v == null) return <span className="text-muted/40">—</span>;
  if (typeof v === "string" && /^https?:\/\//.test(v))
    return (
      <a href={v} target="_blank" rel="noreferrer" className="break-all underline decoration-muted hover:decoration-foreground">
        {v}
      </a>
    );
  if (Array.isArray(v))
    return (
      <ul className="space-y-0.5">
        {v.map((item, i) => (
          <li key={i}>
            <Value v={item} />
          </li>
        ))}
      </ul>
    );
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    if (typeof obj.url === "string" && typeof obj.label === "string")
      return (
        <a href={obj.url} target="_blank" rel="noreferrer" className="underline decoration-muted hover:decoration-foreground">
          {obj.label}
        </a>
      );
    return (
      <div className="space-y-0.5 border-l border-border pl-2">
        {Object.entries(obj).map(([k, val]) => (
          <div key={k} className="grid grid-cols-[110px_1fr] gap-2">
            <span className="text-muted">{k}</span>
            <Value v={val} />
          </div>
        ))}
      </div>
    );
  }
  return <span className="break-all">{String(v)}</span>;
}

function FindingCard({ f }: { f: Finding }) {
  const sev = f.severity || "info";
  return (
    <div className="rounded-sm border border-border bg-panel p-3">
      <div className="flex items-start gap-2">
        <span className={`text-xs ${sev === "high" ? "text-foreground" : "text-muted"}`}>
          {sevMark[sev]}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[9px] uppercase tracking-widest text-muted">{f.source}</span>
            <span className="text-[9px] uppercase tracking-widest text-muted">{sev}</span>
          </div>
          <h3 className="text-xs font-semibold">{f.title}</h3>
          {f.detail && <p className="mt-1 text-[11px] text-muted">{f.detail}</p>}
          {f.url && (
            <a href={f.url} target="_blank" rel="noreferrer" className="mt-1 block break-all text-[11px] underline decoration-muted hover:decoration-foreground">
              {f.url}
            </a>
          )}
          {f.data && (
            <div className="mt-2 text-[11px] text-foreground/90">
              <Value v={f.data} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type Tab = "profile" | "map" | "findings" | "entities";

export function Results({ result }: { result: InvestigationResult }) {
  const [tab, setTab] = useState<Tab>("profile");
  const high = result.findings.filter((f) => f.severity === "high").length;
  const geo = result.geo ?? [];
  const tabs: Tab[] = ["profile", "map", "findings", "entities"];

  return (
    <div className="mt-6">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] uppercase tracking-widest text-muted">
        <span>{result.entities.length} entities</span>
        <span>{result.findings.length} findings</span>
        {high > 0 && <span className="text-foreground">{high} high</span>}
        <span>{result.durationMs}ms</span>
        {result.skipped.length > 0 && <span>{result.skipped.length} skipped</span>}
      </div>

      {result.skipped.length > 0 && (
        <div className="mb-3 rounded-sm border border-border bg-panel-2 px-3 py-2 text-[11px] text-muted">
          configure to enable: {result.skipped.map((s) => `${s.source} (${s.key})`).join(" · ")}
        </div>
      )}

      <div className="mb-4 flex gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b px-3 py-1.5 text-[11px] uppercase tracking-wider transition ${
              tab === t
                ? "border-foreground text-foreground"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t}
            {t === "map" && geo.length > 0 ? ` (${geo.length})` : ""}
          </button>
        ))}
      </div>

      {tab === "profile" && <Profile subject={result.subject} />}

      {tab === "map" && <MapView points={geo} />}

      {tab === "entities" && (
        <div className="flex flex-wrap gap-1.5">
          {result.entities.map((e) => (
            <Pill key={e.id + e.source} e={e} />
          ))}
        </div>
      )}

      {tab === "findings" && (
        <div className="grid gap-2 md:grid-cols-2">
          {result.findings.map((f, i) => (
            <FindingCard key={i} f={f} />
          ))}
        </div>
      )}

      {result.errors.length > 0 && (
        <details className="mt-5 text-[10px] text-muted">
          <summary className="cursor-pointer uppercase tracking-widest">
            {result.errors.length} source errors
          </summary>
          <ul className="mt-2 space-y-0.5">
            {result.errors.map((e, i) => (
              <li key={i}>
                {e.source} / {e.entity}: {e.message}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
