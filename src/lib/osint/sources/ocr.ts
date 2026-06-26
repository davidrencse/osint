import type { Source, Finding, Entity } from "../types";
import { entity } from "../util";
import { analyzeImageJson, visionConfig } from "../vision";

// Detection layer: SIGN / TEXT OCR. A dedicated text pass — separate from the
// holistic geovision estimate — that reads every legible string in the frame and
// turns location-bearing text (shop names, street signs, transit stops) into
// searchable place queries. These feed `geocode`, which resolves them to map
// coordinates. Independent of the visual-estimate layer, so when both agree on a
// spot the fusion in geo.ts boosts confidence (corroboration).

const PROMPT = `You are an OSINT text-extraction and signage analyst. Read EVERY piece of text visible ANYWHERE in the image — shopfronts, banners, billboards, street signs, transit/bus stops, posters, menus, packaging, vehicle livery, graffiti, and faint/blurry/partial/background text. Note the script/language.
For any text that could help pin a real-world location, build a SEARCHABLE place query: combine the business/street/landmark name with the city/area/country you can infer from other cues (e.g. "Cafe Central, Vienna").
Do NOT identify specific private individuals.
Respond with ONLY a JSON object, no prose, no code fences:
{"texts":[{"text":string,"type":"business"|"street"|"transit"|"sign"|"plate"|"other","script":string,"placeQuery":string|null}],"languages":string[],"inferredCountry":string|null}`;

interface OcrOut {
  texts?: { text?: string; type?: string; script?: string; placeQuery?: string | null }[];
  languages?: string[];
  inferredCountry?: string | null;
}

const ocrSource: Source = {
  id: "ocr",
  label: "Sign / Text OCR",
  handles: ["image"],
  requiresKey: "VISION_API_KEY",
  async run(e, ctx) {
    const buf = ctx.images?.[e.value];
    const cfg = visionConfig(ctx.keys);
    if (!buf || !cfg) return [];

    const o = await analyzeImageJson<OcrOut>({
      buffer: buf,
      filename: e.value,
      prompt: PROMPT,
      cfg,
      signal: ctx.signal,
    });

    const texts = (o.texts || []).filter((t) => t && t.text && String(t.text).trim());
    if (!texts.length) {
      return [{ source: "ocr", title: `No readable text in ${e.value}`, severity: "info" }];
    }

    // Turn each distinct place query into a geocodable location entity.
    const entities: Entity[] = [];
    const seen = new Set<string>();
    for (const t of texts) {
      const q = (t.placeQuery || "").trim();
      const lc = q.toLowerCase();
      if (q.length > 2 && !seen.has(lc)) {
        seen.add(lc);
        entities.push(
          entity("location", q, "ocr", 0.5, { label: `sign: ${String(t.text).trim().slice(0, 40)}` }),
        );
      }
    }

    return [
      {
        source: "ocr",
        title: `${texts.length} text item${texts.length > 1 ? "s" : ""} read in ${e.value}`,
        severity: entities.length ? "medium" : "low",
        data: {
          languages: o.languages,
          inferredCountry: o.inferredCountry || undefined,
          texts: texts.map((t) => ({ text: t.text, type: t.type, script: t.script, query: t.placeQuery || undefined })),
          note: "Location-bearing text turned into place queries for geocoding → map.",
        },
        entities,
      } as Finding,
    ];
  },
};

export default ocrSource;
