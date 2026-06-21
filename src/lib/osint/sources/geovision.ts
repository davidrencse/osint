import { generateText, Output } from "ai";
import { z } from "zod";
import type { Source, Finding, Entity, Severity } from "../types";
import { entity } from "../util";

// Visual geolocation: estimate where a photo was taken from PIXEL CONTENT alone
// (works even with zero EXIF). Uses a vision LLM via Vercel AI Gateway.
// Exact-but-rare EXIF GPS is handled separately by the `exif` source.

const MODEL = process.env.GEOVISION_MODEL || "anthropic/claude-sonnet-4.6";

function mediaType(name: string): string {
  const ext = name.toLowerCase().split(".").pop() || "";
  return (
    {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      gif: "image/gif",
      heic: "image/heic",
      heif: "image/heif",
      bmp: "image/bmp",
      tif: "image/tiff",
      tiff: "image/tiff",
    }[ext] || "image/jpeg"
  );
}

const schema = z.object({
  geolocatable: z.boolean().describe("false if the image has no usable location cues at all"),
  city: z.string().nullable(),
  region: z.string().nullable(),
  country: z.string().nullable(),
  lat: z.number().nullable().describe("best-estimate latitude of the most likely location"),
  lon: z.number().nullable().describe("best-estimate longitude"),
  confidence: z.number().describe("0..1 confidence in the primary estimate"),
  reasoning: z.string().describe("how the location was deduced"),
  clues: z.array(z.string()).describe("concrete visual evidence used (signage, plates, flora, etc.)"),
  alternatives: z
    .array(z.object({ place: z.string(), lat: z.number().nullable(), lon: z.number().nullable() }))
    .describe("other plausible locations"),
});

const PROMPT = `You are an expert OSINT geolocation analyst (think GeoGuessr grandmaster + image forensics).
Determine WHERE this photograph was most likely taken, using only visible content. Examine:
- Text: language/script, business names, street/place names, phone numbers, license-plate formats
- Traffic: side of the road, road markings, sign shapes, bollards, utility/power poles
- Built environment: architecture style, building materials, roofing, window styles
- Natural: vegetation, climate cues, terrain, soil color, sun position/shadow direction & length
- Symbols: flags, emblems, sports teams, brands with regional presence
Reason step by step, then commit to the single most likely location and give its lat/lon
(use the city/landmark center if street-level is uncertain). Provide a calibrated confidence.
If there are genuinely no location cues (plain indoor wall, extreme close-up), set geolocatable=false.
Do NOT identify or speculate about specific private individuals in the image.`;

function sevFor(conf: number): Severity {
  if (conf >= 0.7) return "high";
  if (conf >= 0.4) return "medium";
  return "low";
}

const geovisionSource: Source = {
  id: "geovision",
  label: "Visual Geolocation (AI)",
  handles: ["image"],
  requiresKey: "AI_GATEWAY_API_KEY",
  async run(e, ctx) {
    const buf = ctx.images?.[e.value];
    if (!buf) return [];

    const { output } = await generateText({
      model: MODEL,
      temperature: 0.2,
      abortSignal: ctx.signal,
      output: Output.object({ schema }),
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            { type: "image", image: buf, mediaType: mediaType(e.value) },
          ],
        },
      ],
    });

    const o = output;
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

    const place = [o.city, o.region, o.country].filter(Boolean).join(", ") || "unknown";
    const entities: Entity[] = [];
    if (typeof o.lat === "number" && typeof o.lon === "number") {
      entities.push(
        entity("location", `${place} (≈${o.lat.toFixed(3)}, ${o.lon.toFixed(3)})`, "geovision", Math.min(o.confidence, 0.85), {
          label: "visual estimate (AI)",
          meta: { lat: o.lat, lon: o.lon, estimate: true },
        }),
      );
    }
    for (const alt of o.alternatives || []) {
      if (typeof alt.lat === "number" && typeof alt.lon === "number") {
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
        title: `Visual estimate: ${place} (${Math.round(o.confidence * 100)}%)`,
        severity: sevFor(o.confidence),
        url:
          typeof o.lat === "number" && typeof o.lon === "number"
            ? `https://www.google.com/maps?q=${o.lat},${o.lon}`
            : undefined,
        data: {
          estimate: place,
          coords: typeof o.lat === "number" ? `${o.lat}, ${o.lon}` : undefined,
          confidence: o.confidence,
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
