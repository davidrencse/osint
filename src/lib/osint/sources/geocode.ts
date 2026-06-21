import type { Source, Finding, Entity } from "../types";
import { entity, safeFetch } from "../util";

// Free, no-key geocoding via OpenStreetMap Nominatim. Turns text place names
// (IPTC photo tags, GitHub/Gravatar "location" fields) into map coordinates.
// Usage policy: identify via User-Agent (set in safeFetch), low volume only.

const COORD_RE = /^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?/;

interface NominatimHit {
  lat: string;
  lon: string;
  display_name: string;
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
    const res = await safeFetch(url, { headers: { accept: "application/json" } }, 9000, ctx.signal);
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

    // distinct value so it doesn't collide with the source text entity id
    const ent: Entity = entity(
      "location",
      `${e.value} [${lat.toFixed(4)}, ${lon.toFixed(4)}]`,
      "geocode",
      Math.min(e.confidence * 0.9, 0.8),
      {
        label: `geocoded: ${e.value}`,
        meta: { lat, lon, map: `https://www.google.com/maps?q=${lat},${lon}`, geocoded: true },
      },
    );

    return [
      {
        source: "geocode",
        title: `Geocoded "${e.value}" → ${lat.toFixed(4)}, ${lon.toFixed(4)}`,
        severity: "info",
        url: `https://www.google.com/maps?q=${lat},${lon}`,
        data: { query: e.value, match: hit.display_name, lat, lon },
        entities: [ent],
      } as Finding,
    ];
  },
};

export default geocodeSource;
