import type {
  Entity,
  Finding,
  GeoPoint,
  InvestigationResult,
  SeedInput,
  Source,
  SourceContext,
} from "./types";

/** Pull lat/lon out of location entities (meta coords or "lat, lon" value). */
function collectGeo(entities: Entity[]): GeoPoint[] {
  const out: GeoPoint[] = [];
  const seen = new Set<string>();
  for (const e of entities) {
    if (e.type !== "location") continue;
    const m = e.meta as { lat?: number; lon?: number } | undefined;
    let lat = m?.lat;
    let lon = m?.lon;
    if (lat == null || lon == null) {
      const mt = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(e.value);
      if (mt) {
        lat = parseFloat(mt[1]);
        lon = parseFloat(mt[2]);
      }
    }
    if (typeof lat !== "number" || typeof lon !== "number" || Number.isNaN(lat) || Number.isNaN(lon))
      continue;
    const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ lat, lon, label: e.value, source: e.source, confidence: e.confidence });
  }
  return out;
}
import { entity as makeEntity, isValidEntity } from "./util";
import { buildSubject } from "./profile";

import dns from "./sources/dns";
import rdap from "./sources/rdap";
import crtsh from "./sources/crtsh";
import ipgeo from "./sources/ipgeo";
import gravatar from "./sources/gravatar";
import emailAnalyze from "./sources/email";
import usernameEnum from "./sources/username";
import exif from "./sources/exif";
import dorks from "./sources/dorks";
import breach from "./sources/breach";
import social from "./sources/social";
import geocode from "./sources/geocode";
import geovision from "./sources/geovision";
import reverseImage from "./sources/reverse";
import faces from "./sources/faces";

export const SOURCES: Source[] = [
  dns,
  rdap,
  crtsh,
  ipgeo,
  gravatar,
  emailAnalyze,
  usernameEnum,
  social,
  exif,
  geovision,
  faces,
  reverseImage,
  geocode,
  dorks,
  breach,
];

const MAX_PIVOT_ENTITIES = 40; // cap second-pass fan-out

export interface RunOptions {
  /** filename -> buffer for uploaded images */
  images?: Record<string, Buffer>;
  /** disable expensive pivoting */
  pivot?: boolean;
  signal?: AbortSignal;
}

function keysFromEnv(): Record<string, string | undefined> {
  return {
    HIBP_API_KEY: process.env.HIBP_API_KEY,
    SHODAN_API_KEY: process.env.SHODAN_API_KEY,
    HUNTER_API_KEY: process.env.HUNTER_API_KEY,
    // Vision provider key — VISION_API_KEY wins, GROQ_API_KEY is the default fallback.
    VISION_API_KEY: process.env.VISION_API_KEY || process.env.GROQ_API_KEY,
  };
}

export async function investigate(
  seeds: SeedInput[],
  opts: RunOptions = {},
): Promise<InvestigationResult> {
  const startedAt = new Date();
  const ctx: SourceContext = {
    keys: keysFromEnv(),
    images: opts.images,
    signal: opts.signal,
  };

  const entities = new Map<string, Entity>();
  const findings: Finding[] = [];
  const errors: InvestigationResult["errors"] = [];
  const skipped: InvestigationResult["skipped"] = [];

  // seed entities
  for (const s of seeds) {
    const e = makeEntity(s.type, s.value, "input", 1.0);
    entities.set(e.id, e);
  }
  // image entities from uploads
  for (const fname of Object.keys(opts.images || {})) {
    const e = makeEntity("image", fname, "input", 1.0);
    entities.set(e.id, e);
  }

  const ran = new Set<string>(); // `${sourceId}::${entityId}` dedupe

  async function dispatch(targets: Entity[]) {
    const jobs: Promise<void>[] = [];
    for (const ent of targets) {
      for (const src of SOURCES) {
        if (!src.handles.includes(ent.type)) continue;
        const tag = `${src.id}::${ent.id}`;
        if (ran.has(tag)) continue;
        ran.add(tag);

        if (src.requiresKey && !ctx.keys[src.requiresKey]) {
          skipped.push({ source: src.label, key: src.requiresKey });
          continue;
        }
        jobs.push(
          src
            .run(ent, ctx)
            .then((fs) => {
              for (const f of fs) {
                findings.push(f);
                for (const ne of f.entities || []) {
                  if (!isValidEntity(ne)) continue;
                  if (!entities.has(ne.id)) entities.set(ne.id, ne);
                }
              }
            })
            .catch((err: unknown) => {
              errors.push({
                source: src.id,
                entity: ent.id,
                message: err instanceof Error ? err.message : String(err),
              });
            }),
        );
      }
    }
    await Promise.all(jobs);
  }

  // pass 1: seeds
  const seedEntities = [...entities.values()];
  await dispatch(seedEntities);

  // pass 2: pivot on newly discovered entities (one level deep)
  if (opts.pivot !== false) {
    const seedIds = new Set(seedEntities.map((e) => e.id));
    const discovered = [...entities.values()]
      .filter((e) => !seedIds.has(e.id))
      .filter((e) => e.confidence >= 0.6)
      .slice(0, MAX_PIVOT_ENTITIES);
    await dispatch(discovered);
  }

  // dedupe skipped
  const seenSkip = new Set<string>();
  const skippedUniq = skipped.filter((s) => {
    const k = `${s.source}:${s.key}`;
    if (seenSkip.has(k)) return false;
    seenSkip.add(k);
    return true;
  });

  const finishedAt = new Date();
  const entityList = [...entities.values()].sort((a, b) => b.confidence - a.confidence);
  return {
    query: seeds,
    subject: buildSubject(entityList, findings),
    geo: collectGeo(entityList),
    entities: entityList,
    findings,
    skipped: skippedUniq,
    errors,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
  };
}
