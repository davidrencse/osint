import type { Source, Finding, Entity, Severity } from "../types";
import { entity } from "../util";
import { analyzeImageJson, visionConfig, VISION_MAX_BYTES } from "../vision";

// Visual geolocation: estimate where a photo was taken from PIXEL CONTENT alone
// (works even with zero metadata). Provider-agnostic — see ../vision.ts.
// EXIF GPS and IPTC/XMP tags are handled by `exif`; geocoding by `geocode`.

const PROMPT = `You are an expert OSINT geolocation analyst (GeoGuessr grandmaster + image forensics).
Determine WHERE this photograph was most likely taken using only visible content:
- Text: language/script, business/street names, phone numbers, license-plate formats
- Traffic: side of road, road markings, sign shapes, bollards, utility poles
- Built environment: architecture, materials, roofing, window styles
- Natural: vegetation, climate, terrain, soil, sun position/shadows
- Symbols: flags, emblems, brands with regional presence
Commit to the single most likely location with its lat/lon (city/landmark center if street-level is uncertain).
Also transcribe ALL readable text (signs, labels) and list any named, searchable places/businesses/landmarks.
Do NOT identify specific private individuals.
Respond with ONLY a JSON object, no prose, no code fences:
{"geolocatable":bool,"city":string|null,"region":string|null,"country":string|null,"lat":number|null,"lon":number|null,"confidence":number,"reasoning":string,"clues":string[],"visibleText":string[],"landmarks":string[],"alternatives":[{"place":string,"lat":number|null,"lon":number|null}]}`;

interface GeoOut {
  geolocatable?: boolean;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  lat?: number | null;
  lon?: number | null;
  confidence?: number;
  reasoning?: string;
  clues?: string[];
  visibleText?: string[];
  landmarks?: string[];
  alternatives?: { place: string; lat: number | null; lon: number | null }[];
}

const sevFor = (c: number): Severity => (c >= 0.7 ? "high" : c >= 0.4 ? "medium" : "low");

function point(place: string, lat: number, lon: number, label: string, conf: number): Entity {
  return entity("location", `${place} (≈${lat.toFixed(3)}, ${lon.toFixed(3)})`, "geovision", conf, {
    label,
    meta: { lat, lon, estimate: true },
  });
}

const geovisionSource: Source = {
  id: "geovision",
  label: "Visual Geolocation (AI)",
  handles: ["image"],
  requiresKey: "VISION_API_KEY",
  async run(e, ctx) {
    const buf = ctx.images?.[e.value];
    const cfg = visionConfig(ctx.keys);
    if (!buf || !cfg) return [];
    if (buf.length > VISION_MAX_BYTES) {
      return [
        {
          source: "geovision",
          title: `Image too large for AI geolocation (${(buf.length / 1e6).toFixed(1)}MB)`,
          severity: "info",
          detail: "Vision APIs accept images up to ~4MB. Resize/compress and retry.",
        },
      ];
    }

    const o = await analyzeImageJson<GeoOut>({
      buffer: buf,
      filename: e.value,
      prompt: PROMPT,
      cfg,
      signal: ctx.signal,
    });

    if (!o.geolocatable) {
      return [
        { source: "geovision", title: `No visual location cues in ${e.value}`, severity: "info", detail: o.reasoning },
      ];
    }

    const conf = typeof o.confidence === "number" ? o.confidence : 0.3;
    const place = [o.city, o.region, o.country].filter(Boolean).join(", ") || "unknown";
    const entities: Entity[] = [];
    if (typeof o.lat === "number" && typeof o.lon === "number") {
      entities.push(point(place, o.lat, o.lon, "visual estimate (AI)", Math.min(conf, 0.8)));
    }
    for (const alt of o.alternatives || []) {
      if (typeof alt?.lat === "number" && typeof alt?.lon === "number") {
        entities.push(point(alt.place, alt.lat, alt.lon, "alternative estimate", 0.3));
      }
    }
    // feed named landmarks/businesses back into the pipeline (geocode -> map)
    for (const lm of o.landmarks || []) {
      const v = String(lm).trim();
      if (v.length > 2) entities.push(entity("location", v, "geovision", 0.6, { label: "landmark in photo" }));
    }

    return [
      {
        source: "geovision",
        title: `Visual estimate: ${place} (${Math.round(conf * 100)}%)`,
        severity: sevFor(conf),
        url:
          typeof o.lat === "number" && typeof o.lon === "number"
            ? `https://www.google.com/maps?q=${o.lat},${o.lon}`
            : undefined,
        data: {
          estimate: place,
          coords: typeof o.lat === "number" ? `${o.lat}, ${o.lon}` : undefined,
          confidence: conf,
          reasoning: o.reasoning,
          clues: o.clues,
          visibleText: o.visibleText,
          landmarks: o.landmarks,
          alternatives: (o.alternatives || []).map((a) => a.place),
          model: cfg.model,
          note: "AI inference from image content — verify before relying on it.",
        },
        entities,
      } as Finding,
    ];
  },
};

export default geovisionSource;
