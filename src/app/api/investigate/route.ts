import { NextRequest, NextResponse } from "next/server";
import { parseInputs, normalize } from "@/lib/osint/classify";
import { investigate } from "@/lib/osint/engine";
import type { EntityType, SeedInput } from "@/lib/osint/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const VALID: EntityType[] = ["email", "username", "domain", "ip", "url", "name", "phone"];

/** Explicit typed seeds from the structured form — no classification guessing. */
function fromExplicit(raw: unknown): SeedInput[] {
  if (!Array.isArray(raw)) return [];
  const out: SeedInput[] = [];
  for (const s of raw) {
    const type = (s?.type ?? "") as EntityType;
    const value = String(s?.value ?? "").trim();
    if (!value || !VALID.includes(type)) continue;
    out.push({ raw: value, type, value: normalize(type, value) });
  }
  return out;
}

function dedupe(seeds: SeedInput[]): SeedInput[] {
  const seen = new Set<string>();
  return seeds.filter((s) => {
    const k = `${s.type}:${s.value}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export async function POST(req: NextRequest) {
  const ct = req.headers.get("content-type") || "";
  let blob = "";
  let explicit: SeedInput[] = [];
  const images: Record<string, Buffer> = {};

  try {
    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      blob = String(form.get("query") || "");
      const seedsRaw = form.get("seeds");
      if (typeof seedsRaw === "string" && seedsRaw) explicit = fromExplicit(JSON.parse(seedsRaw));
      for (const [, val] of form.entries()) {
        if (val instanceof File && val.size > 0) {
          const buf = Buffer.from(await val.arrayBuffer());
          images[val.name || `upload-${Object.keys(images).length}`] = buf;
        }
      }
    } else {
      const body = (await req.json()) as { query?: string; seeds?: unknown };
      blob = body.query || "";
      explicit = fromExplicit(body.seeds);
    }
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const seeds = dedupe([...explicit, ...parseInputs(blob)]);
  if (!seeds.length && !Object.keys(images).length) {
    return NextResponse.json(
      { error: "No recognizable inputs. Provide emails, usernames, domains, IPs, names, or images." },
      { status: 400 },
    );
  }

  try {
    const result = await investigate(seeds, { images });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Investigation failed" },
      { status: 500 },
    );
  }
}
