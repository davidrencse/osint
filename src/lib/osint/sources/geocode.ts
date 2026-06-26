import type { Source, Finding, Entity } from "../types";
import { entity, safeFetch, createLimiter } from "../util";

// Free, no-key geocoding via OpenStreetMap Nominatim. Turns text place names
// (IPTC photo tags, AI landmarks) into map coordinates.
// Usage policy: identify via User-Agent (set in safeFetch), low volume only.

const COORD_RE = /^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?/;

// Nominatim asks for ≤1 request/sec — fanning out many concurrent lookups gets
// the IP throttled (slower) or blocked. Cap to 1 in-flight across all locations.
const geocodeLimit = createLimiter(1);

interface NominatimHit {
  lat: string;
  lon: string;
  display_name: string;
  importance?: number;
  addresstype?: string;
  type?: string;
  /** [south, north, west, east] as strings */
  boundingbox?: [string, string, string, string];
}

/** approximate accuracy radius (km) from a Nominatim bounding box */
function radiusFromBbox(bb?: NominatimHit["boundingbox"]): number {
  if (!bb || bb.length !== 4) return 5;
  const [s, n, w, e] = bb.map(Number);
  if ([s, n, w, e].some(Number.isNaN)) return 5;
  const latKm = Math.abs(n - s) * 111;
  const lonKm = Math.abs(e - w) * 111 * Math.cos((((s + n) / 2) * Math.PI) / 180);
  return Math.max(0.05, Math.hypot(latKm, lonKm) / 2);
}

const geocodeSource: Source = {
  id: "geocode",
  label: "Geocoding (OpenStreetMap)",
  handles: ["location"],
  async run(e, ctx) {
    // already has coordinates? nothing to do
    const m = e.meta as { lat?: number; lon?: number } | undefined;
    if ((m?.lat != null && m?.lon != null) || COORD_RE.test(e.value)) return [];

    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
      e.value,
    )}&format=jsonv2&limit=1&addressdetails=0`;
    // serialize the actual request (politeness); the coord check above already
    // short-circuited entities that need no network call.
    const res = await geocodeLimit(() =>
      safeFetch(url, { headers: { accept: "application/json" } }, 9000, ctx.signal),
    );
    if (!res.ok) return [];
    let hits: NominatimHit[];
    try {
      hits = (await res.json()) as NominatimHit[];
    } catch {
      return [];
    }
    const hit = hits[0];
    if (!hit) return [];

    const lat = parseFloat(hit.lat);
    const lon = parseFloat(hit.lon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) return [];

    // Nominatim importance (0..1) ranks how notable a match is. For short/generic
    // queries a low-importance hit is usually the wrong same-named place — drop it.
    const importance = typeof hit.importance === "number" ? hit.importance : 0;
    if (e.value.trim().length <= 12 && importance > 0 && importance < 0.25) return [];

    const radiusKm = radiusFromBbox(hit.boundingbox);
    // confidence blends the seed entity's confidence with match notability
    const conf = Math.min(
      0.85,
      Math.max(0.3, e.confidence * 0.9) * (0.7 + Math.min(importance, 0.6) * 0.5),
    );

    // distinct value so it doesn't collide with the source text entity id
    const ent: Entity = entity(
      "location",
      `${e.value} [${lat.toFixed(4)}, ${lon.toFixed(4)}]`,
      "geocode",
      conf,
      {
        label: `geocoded: ${e.value}`,
        meta: {
          lat,
          lon,
          radiusKm,
          kind: "geocoded",
          map: `https://www.google.com/maps?q=${lat},${lon}`,
          geocoded: true,
        },
      },
    );

    return [
      {
        source: "geocode",
        title: `Geocoded "${e.value}" → ${lat.toFixed(4)}, ${lon.toFixed(4)}`,
        severity: "info",
        url: `https://www.google.com/maps?q=${lat},${lon}`,
        data: {
          query: e.value,
          match: hit.display_name,
          lat,
          lon,
          precisionKm: Math.round(radiusKm * 10) / 10,
          importance: importance || undefined,
        },
        entities: [ent],
      } as Finding,
    ];
  },
};

export default geocodeSource;
