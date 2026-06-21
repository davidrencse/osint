"use client";

import { useState } from "react";
import type { EntityType, InvestigationResult } from "@/lib/osint/types";
import { Results } from "@/components/Results";

type Mode = "text" | "form";

interface FormState {
  name: string;
  email: string;
  username: string;
  domain: string;
  ip: string;
  phone: string;
  notes: string;
}

const EMPTY: FormState = {
  name: "",
  email: "",
  username: "",
  domain: "",
  ip: "",
  phone: "",
  notes: "",
};

// which form fields map to which seed type (notes excluded — never queried)
const FIELD_TYPE: Record<keyof Omit<FormState, "notes">, EntityType> = {
  name: "name",
  email: "email",
  username: "username",
  domain: "domain",
  ip: "ip",
  phone: "phone",
};

const FIELDS: { key: keyof Omit<FormState, "notes">; label: string; ph: string }[] = [
  { key: "name", label: "Full name(s)", ph: "Jane Doe" },
  { key: "email", label: "Email(s)", ph: "jane@example.com" },
  { key: "username", label: "Username(s)", ph: "jdoe_88" },
  { key: "domain", label: "Domain(s)", ph: "example.com" },
  { key: "ip", label: "IP address(es)", ph: "8.8.8.8" },
  { key: "phone", label: "Phone(s)", ph: "+1 555 0100" },
];

function splitValues(s: string): string[] {
  return s
    .split(/[\n,]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export default function Home() {
  const [mode, setMode] = useState<Mode>("text");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<FormState>(EMPTY);
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InvestigationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function buildSeeds() {
    const seeds: { type: EntityType; value: string }[] = [];
    for (const { key } of FIELDS) {
      for (const v of splitValues(form[key])) seeds.push({ type: FIELD_TYPE[key], value: v });
    }
    return seeds;
  }

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      if (mode === "text") fd.set("query", query);
      else fd.set("seeds", JSON.stringify(buildSeeds()));
      for (const f of files) fd.append("images", f, f.name);
      const res = await fetch("/api/investigate", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Request failed");
      setResult(json as InvestigationResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-5 flex items-baseline justify-between border-b border-border pb-3">
        <h1 className="text-sm font-semibold tracking-[0.2em] uppercase">
          OSINT<span className="text-muted">/</span>Directory
        </h1>
        <span className="text-[10px] uppercase tracking-widest text-muted">public-source recon</span>
      </header>

      {/* mode switch */}
      <div className="mb-3 flex gap-1">
        {(["text", "form"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-sm border px-3 py-1 text-[11px] uppercase tracking-wider transition ${
              mode === m ? "border-foreground text-foreground" : "border-border text-muted hover:text-foreground"
            }`}
          >
            {m === "text" ? "quick text" : "structured form"}
          </button>
        ))}
      </div>

      <form
        className="rounded-md border border-border bg-panel"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        {mode === "text" ? (
          <textarea
            suppressHydrationWarning
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") run();
            }}
            rows={4}
            spellCheck={false}
            placeholder={"jane.doe@example.com   ·   example.com   ·   8.8.8.8   ·   jdoe_88   ·   Jane Doe"}
            className="w-full resize-y bg-transparent p-3 text-xs leading-relaxed outline-none placeholder:text-muted/50"
          />
        ) : (
          <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2">
            {FIELDS.map(({ key, label, ph }) => (
              <label key={key} className="block bg-panel p-3">
                <span className="text-[9px] uppercase tracking-[0.18em] text-muted">{label}</span>
                <input
                  suppressHydrationWarning
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={ph}
                  spellCheck={false}
                  className="mt-1 w-full bg-transparent text-xs outline-none placeholder:text-muted/40"
                />
              </label>
            ))}
            <label className="block bg-panel p-3 sm:col-span-2">
              <span className="text-[9px] uppercase tracking-[0.18em] text-muted">
                Notes (not queried)
              </span>
              <textarea
                suppressHydrationWarning
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                placeholder="context, case ref, hypotheses…"
                className="mt-1 w-full resize-y bg-transparent text-xs outline-none placeholder:text-muted/40"
              />
            </label>
          </div>
        )}

        <div className="flex items-center gap-3 border-t border-border px-3 py-2">
          <label className="cursor-pointer text-[11px] uppercase tracking-wider text-muted hover:text-foreground">
            + images
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
            />
          </label>
          {files.length > 0 && (
            <span className="truncate text-[11px] text-muted">{files.length} file(s)</span>
          )}
          <span className="ml-auto text-[10px] text-muted/60">multiple values: comma / newline</span>
          <button
            type="submit"
            disabled={loading}
            className="rounded-sm bg-foreground px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-black transition disabled:opacity-25"
          >
            {loading ? "scanning" : "run"}
          </button>
        </div>
      </form>

      <p className="mt-2 text-[10px] leading-relaxed text-muted">
        Authorized use only · free public sources (RDAP · DNS · crt.sh · Gravatar · cert logs ·
        public profiles) · no login-gated scraping · race/ethnicity & other sensitive traits not
        inferred.
      </p>

      {error && (
        <div className="mt-5 rounded-md border border-border bg-panel-2 px-3 py-2 text-xs text-foreground">
          ✕ {error}
        </div>
      )}

      {result && <Results result={result} />}
    </main>
  );
}
