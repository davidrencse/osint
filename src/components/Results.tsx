"use client";

import { useState } from "react";
import type { Entity, Finding, GeolocateResult, Severity } from "@/lib/osint/types";
import { MapView } from "./MapView";

// severity → amber-weighted markers (high = full signal amber)
const sevMark: Record<Severity, string> = {
  info: "·",
  low: "▸",
  medium: "▴",
  high: "■",
};
const sevColor: Record<Severity, string> = {
  info: "text-muted",
  low: "text-muted",
  medium: "text-foreground",
  high: "text-accent",
};

function Pill({ e }: { e: Entity }) {
  return (
    <span
      title={`${e.source} · ${(e.confidence * 100).toFixed(0)}%`}
      className="inline-flex items-center gap-2 rounded-sm border border-border bg-panel-2 px-3 py-1.5 text-sm transition hover:border-accent/50"
    >
      <span className="text-[10px] uppercase tracking-widest text-accent/70">{e.type}</span>
      <span className="text-foreground">{e.label && e.label !== e.value ? e.label : e.value}</span>
    </span>
  );
}

function Value({ v }: { v: unknown }) {
  if (v == null) return <span className="text-muted/40">—</span>;
  if (typeof v === "string" && /^https?:\/\//.test(v))
    return (
      <a href={v} target="_blank" rel="noreferrer" className="break-all text-accent underline decoration-accent/40 hover:decoration-accent">
        {v}
      </a>
    );
  if (Array.isArray(v))
    return (
      <ul className="space-y-1">
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
      return /^https?:\/\//.test(obj.url) ? (
        <a href={obj.url} target="_blank" rel="noreferrer" className="text-accent underline decoration-accent/40 hover:decoration-accent">
          {obj.label}
        </a>
      ) : (
        <span>{obj.label}</span>
      );
    return (
      <div className="space-y-1 border-l border-border pl-3">
        {Object.entries(obj).map(([k, val]) => (
          <div key={k} className="grid grid-cols-[120px_1fr] gap-3">
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
    <div
      className={`rounded-sm border bg-panel p-5 transition hover:bg-panel-2 ${
        sev === "high" ? "border-accent/60" : "border-border"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className={`text-lg leading-none ${sevColor[sev]}`}>{sevMark[sev]}</span>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <span className="text-[10px] uppercase tracking-[0.25em] text-accent/70">{f.source}</span>
            <span className="text-[10px] uppercase tracking-[0.25em] text-muted">{sev}</span>
          </div>
          <h3 className="text-base font-semibold leading-snug">{f.title}</h3>
          {f.detail && <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.detail}</p>}
          {f.url && (
            <a href={f.url} target="_blank" rel="noreferrer" className="mt-2 block break-all text-sm text-accent underline decoration-accent/40 hover:decoration-accent">
              {f.url}
            </a>
          )}
          {f.data && (
            <div className="mt-3 text-sm text-foreground/90">
              <Value v={f.data} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type Tab = "map" | "faces" | "findings" | "entities";

interface FaceRow {
  face: number;
  gender?: string;
  age?: string;
  emotion?: string;
  ethnicity?: string;
  features?: string;
  confidence?: string;
}

function FacesPanel({ findings }: { findings: Finding[] }) {
  const faceFindings = findings.filter((f) => f.source === "faces" && Array.isArray(f.data?.faces));
  const rows: FaceRow[] = faceFindings.flatMap((f) => (f.data!.faces as FaceRow[]) ?? []);

  if (!rows.length) {
    return (
      <p className="text-sm text-muted">
        No faces detected (or face analysis needs <code className="text-accent">VISION_API_KEY</code>/
        <code className="text-accent">GROQ_API_KEY</code> set + dev server restarted).
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((r, i) => (
        <div key={i} className="rounded-sm border border-border bg-panel p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="font-display text-2xl text-accent">FACE {r.face ?? i + 1}</span>
            {r.confidence && <span className="text-[11px] text-muted">{r.confidence}</span>}
          </div>
          <dl className="space-y-1 text-sm">
            {[
              ["gender", r.gender],
              ["age", r.age],
              ["emotion", r.emotion],
              ["ethnicity", r.ethnicity],
              ["features", r.features],
            ]
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} className="grid grid-cols-[90px_1fr] gap-2">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-foreground">{v}</dd>
                </div>
              ))}
          </dl>
        </div>
      ))}
      <p className="col-span-full text-[11px] text-muted">
        AI estimates from pixels — perceived attributes only, often wrong. Not identity, not fact.
      </p>
    </div>
  );
}

function Stat({ n, label, accent }: { n: number | string; label: string; accent?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className={`font-display text-3xl leading-none ${accent ? "text-accent" : "text-foreground"}`}>{n}</span>
      <span className="eyebrow mt-1">{label}</span>
    </div>
  );
}

export function Results({ result }: { result: GeolocateResult }) {
  const [tab, setTab] = useState<Tab>("map");
  const high = result.findings.filter((f) => f.severity === "high").length;
  const geo = result.geo ?? [];
  const faceCount = result.findings
    .filter((f) => f.source === "faces" && Array.isArray(f.data?.faces))
    .reduce((n, f) => n + (f.data!.faces as unknown[]).length, 0);
  const tabs: Tab[] = ["map", "faces", "findings", "entities"];

  return (
    <div className="mt-10 rise">
      <div className="mb-8 flex flex-wrap items-end gap-x-10 gap-y-4 border-b border-border pb-6">
        <Stat n={geo.length} label="map points" accent />
        <Stat n={result.entities.length} label="entities" />
        <Stat n={result.findings.length} label="findings" />
        {high > 0 && <Stat n={high} label="high signal" accent />}
        <Stat n={`${result.durationMs}ms`} label="elapsed" />
        {result.skipped.length > 0 && <Stat n={result.skipped.length} label="skipped" />}
      </div>

      {result.skipped.length > 0 && (
        <div className="mb-6 rounded-sm border border-border bg-panel-2 px-4 py-3 text-sm text-muted">
          configure to enable: {result.skipped.map((s) => `${s.source} (${s.key})`).join(" · ")}
        </div>
      )}

      <div className="mb-6 flex gap-2 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-5 py-2.5 text-sm uppercase tracking-widest transition ${
              tab === t
                ? "border-accent text-foreground"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t}
            {t === "map" && geo.length > 0 ? ` (${geo.length})` : ""}
            {t === "faces" && faceCount > 0 ? ` (${faceCount})` : ""}
          </button>
        ))}
      </div>

      {tab === "map" && <MapView points={geo} />}

      {tab === "faces" && <FacesPanel findings={result.findings} />}

      {tab === "entities" && (
        <div className="flex flex-wrap gap-2">
          {result.entities.map((e) => (
            <Pill key={e.id + e.source} e={e} />
          ))}
        </div>
      )}

      {tab === "findings" && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {result.findings.map((f, i) => (
            <FindingCard key={i} f={f} />
          ))}
        </div>
      )}

      {result.errors.length > 0 && (
        <details className="mt-8 text-xs text-muted">
          <summary className="cursor-pointer uppercase tracking-widest hover:text-foreground">
            {result.errors.length} source errors
          </summary>
          <ul className="mt-3 space-y-1">
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
