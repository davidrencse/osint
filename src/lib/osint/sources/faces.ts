import type { Source, Finding } from "../types";
import { analyzeImageJson, visionConfig } from "../vision";
import { hostImage } from "./reverse";

// Face detection -> reverse search. Locates faces in the uploaded image (via the
// vision model, no biometric DB), crops each one, hosts the crop, and hands it to
// existing reverse-image / face-search engines (Google Lens, Yandex, PimEyes,
// FaceCheck) which run their own matching under their own legal/consent terms.
//
// This does NOT perform 1:N biometric identification or maintain any face
// database. PRIVACY: face crops are uploaded to a public host (catbox); disable
// with REVERSE_IMAGE_UPLOAD=0.

const q = (s: string) => encodeURIComponent(s);

const PROMPT = `Detect every human FACE in this image. Do not identify or name anyone.
For each face return a tight bounding box in normalized coordinates (0..1, origin top-left).
Respond with ONLY JSON, no prose, no code fences:
{"faces":[{"x":number,"y":number,"w":number,"h":number}]}`;

interface FaceBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

const facesSource: Source = {
  id: "faces",
  label: "Face Detection + Reverse Search",
  handles: ["image"],
  requiresKey: "VISION_API_KEY",
  async run(e, ctx) {
    const buf = ctx.images?.[e.value];
    const cfg = visionConfig(ctx.keys);
    if (!buf || !cfg) return [];

    const out = await analyzeImageJson<{ faces?: FaceBox[] }>({
      buffer: buf,
      filename: e.value,
      prompt: PROMPT,
      cfg,
      signal: ctx.signal,
    });
    const faces = (out.faces || []).filter(
      (f) => typeof f.x === "number" && typeof f.w === "number" && f.w > 0 && f.h > 0,
    );

    if (!faces.length) {
      return [{ source: "faces", title: `No faces detected in ${e.value}`, severity: "info" }];
    }

    const sharp = (await import("sharp")).default;
    const meta = await sharp(buf).metadata();
    const W = meta.width || 0;
    const H = meta.height || 0;
    if (!W || !H) return [{ source: "faces", title: `Could not read image dimensions`, severity: "info" }];

    const hostingOff = process.env.REVERSE_IMAGE_UPLOAD === "0";
    const findings: Finding[] = [];

    for (let i = 0; i < faces.length; i++) {
      const f = faces[i];
      // expand the box ~30% for context, clamp to image
      const cx = clamp01(f.x - f.w * 0.15);
      const cy = clamp01(f.y - f.h * 0.15);
      const cw = clamp01(f.w * 1.3);
      const ch = clamp01(f.h * 1.3);
      const left = Math.floor(cx * W);
      const top = Math.floor(cy * H);
      const width = Math.max(1, Math.min(W - left, Math.round(cw * W)));
      const height = Math.max(1, Math.min(H - top, Math.round(ch * H)));

      let cropUrl: string | null = null;
      try {
        const crop = await sharp(buf).extract({ left, top, width, height }).jpeg({ quality: 90 }).toBuffer();
        if (!hostingOff) cropUrl = await hostImage(crop, `face-${i + 1}.jpg`, ctx.signal);
      } catch {
        // crop failed — still report the detection
      }

      const links = cropUrl
        ? [
            { label: "Google Lens", url: `https://lens.google.com/uploadbyurl?url=${q(cropUrl)}` },
            { label: "Yandex (faces)", url: `https://yandex.com/images/search?rpt=imageview&url=${q(cropUrl)}` },
            { label: "PimEyes (upload crop)", url: "https://pimeyes.com/en" },
            { label: "FaceCheck.id (upload crop)", url: "https://facecheck.id/" },
          ]
        : [
            { label: "PimEyes", url: "https://pimeyes.com/en" },
            { label: "FaceCheck.id", url: "https://facecheck.id/" },
          ];

      findings.push({
        source: "faces",
        title: `Face ${i + 1} of ${faces.length} — reverse search`,
        severity: "low",
        url: cropUrl || undefined,
        detail: cropUrl
          ? "Cropped face hosted for URL-based search. Lens/Yandex run by URL; PimEyes/FaceCheck need a manual upload of the crop."
          : "Face detected; crop hosting disabled — upload the image to a face-search engine manually.",
        data: {
          faceCrop: cropUrl || undefined,
          box: { x: f.x, y: f.y, w: f.w, h: f.h },
          links,
          note: cropUrl ? "Crop uploaded to catbox.moe (public). Set REVERSE_IMAGE_UPLOAD=0 to disable." : undefined,
        },
      });
    }

    return findings;
  },
};

export default facesSource;
