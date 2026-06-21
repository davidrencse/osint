import type { Source, Finding, Entity, Severity } from "../types";
import { entity, safeFetch } from "../util";

// Visual geolocation: estimate where a photo was taken from PIXEL CONTENT alone
// (works even with zero metadata). Uses Groq's free vision model. EXIF GPS and
// IPTC/XMP place tags are handled by the `exif` source; geocoding by `geocode`.

const MODEL = process.env.GROQ_VISION_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct";
const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const MAX_BYTES = 4 * 1024 * 1024; // Groq base64 image limit ~4MB

function mediaType(name: string): string {
  const ext = name.toLowerCase().split(".").pop() || "";
  return (
    { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" }[
      ext
    ] || "image/jpeg"
  );
}

const PROMPT = `You are an expert OSINT geolocation analyst (GeoGuessr grandmaster + image forensics).
Determine WHERE this photograph was most likely taken using only visible content:
- Text: language/script, business/street names, phone numbers, license-plate formats
- Traffic: side of road, road markings, sign shapes, bollards, utility poles
- Built environment: architecture, materials, roofing, window styles
- Natural: vegetation, climate, terrain, soil, sun position/shadows
- Symbols: flags, emblems, brands with regional presence
Commit to the single most likely location with its lat/lon (city/landmark center if street-level is uncertain).
Do NOT identify specific private individuals.
Respond with ONLY a JSON object, no prose, no code fences:
{"geolocatable":bool,"city":string|null,"region":string|null,"country":string|null,"lat":number|null,"lon":number|null,"confidence":number,"reasoning":string,"clues":string[],"alternatives":[{"place":string,"lat":number|null,"lon":number|null}]}`;

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
  alternatives?: { place: string; lat: number | null; lon: number | null }[];
}

function parseJson(text: string): GeoOut | null {
  try {
    return JSON.parse(text) as GeoOut;
  } catch {
    const a = text.indexOf("{");
    const b = text.lastIndexOf("}");
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(text.slice(a, b + 1)) as GeoOut;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function sevFor(conf: number): Severity {
  if (conf >= 0.7) return "high";
  if (conf >= 0.4) return "medium";
  return "low";
}

const geovisionSource: Source = {
  id: "geovision",
  label: "Visual Geolocation (Groq AI)",
  handles: ["image"],
  requiresKey: "GROQ_API_KEY",
  async run(e, ctx) {
    const buf = ctx.images?.[e.value];
    const key = ctx.keys.GROQ_API_KEY;
    if (!buf || !key) return [];
    if (buf.length > MAX_BYTES) {
      return [
        {
          source: "geovision",
          title: `Image too large for AI geolocation (${(buf.length / 1e6).toFixed(1)}MB)`,
          severity: "info",
          detail: "Groq vision accepts images up to ~4MB. Resize/compress and retry.",
        },
      ];
    }

    const dataUrl = `data:${mediaType(e.value)};base64,${buf.toString("base64")}`;
    const res = await safeFetch(
      ENDPOINT,
      {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          temperature: 0.2,
          max_tokens: 1024,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: PROMPT },
                { type: "image_url", image_url: { url: dataUrl } },
              ],
            },
          ],
        }),
      },
      20000,
      ctx.signal,
    );
    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      throw new Error(`Groq ${res.status}: ${msg.slice(0, 200)}`);
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = json.choices?.[0]?.message?.content || "";
    const o = parseJson(content);
    if (!o) throw new Error("Groq returned unparseable output");

    if (!o.geolocatable) {
      return [
        {
          source: "geovision",
          title: `No visual location cues in ${e.value}`,
          severity: "info",
          detail: o.reasoning,
        },
      ];
    }

    const conf = typeof o.confidence === "number" ? o.confidence : 0.3;
    const place = [o.city, o.region, o.country].filter(Boolean).join(", ") || "unknown";
    const entities: Entity[] = [];
    if (typeof o.lat === "number" && typeof o.lon === "number") {
      entities.push(
        entity("location", `${place} (≈${o.lat.toFixed(3)}, ${o.lon.toFixed(3)})`, "geovision", Math.min(conf, 0.8), {
          label: "visual estimate (AI)",
          meta: { lat: o.lat, lon: o.lon, estimate: true },
        }),
      );
    }
    for (const alt of o.alternatives || []) {
      if (typeof alt?.lat === "number" && typeof alt?.lon === "number") {
        entities.push(
          entity("location", `${alt.place} (≈${alt.lat.toFixed(3)}, ${alt.lon.toFixed(3)})`, "geovision", 0.3, {
            label: "alternative estimate",
            meta: { lat: alt.lat, lon: alt.lon, estimate: true },
          }),
        );
      }
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
          alternatives: (o.alternatives || []).map((a) => a.place),
          model: MODEL,
          note: "AI inference from image content — verify before relying on it.",
        },
        entities,
      },
    ];
  },
};

export default geovisionSource;
