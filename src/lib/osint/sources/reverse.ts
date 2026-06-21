import type { Source, Finding } from "../types";
import { imageMediaType, safeFetch } from "../util";

// Reverse image search. Hosts the uploaded image on a free no-key host (catbox)
// to get a public URL, then builds one-click reverse-search links for the major
// engines. Parsing those results requires a paid API (SerpApi/Bing) — out of
// the free scope — so we hand off clickable searches instead.
//
// PRIVACY: this uploads the image to a public third-party host. Disable with
// REVERSE_IMAGE_UPLOAD=0 if the subject image must not leave your control.

const q = (s: string) => encodeURIComponent(s);

async function hostImage(buf: Buffer, name: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const fd = new FormData();
    fd.append("reqtype", "fileupload");
    fd.append("fileToUpload", new Blob([new Uint8Array(buf)], { type: imageMediaType(name) }), name);
    const res = await safeFetch("https://catbox.moe/user/api.php", { method: "POST", body: fd }, 25000, signal);
    if (!res.ok) return null;
    const url = (await res.text()).trim();
    return /^https?:\/\//.test(url) ? url : null;
  } catch {
    return null;
  }
}

const reverseSource: Source = {
  id: "reverse-image",
  label: "Reverse Image Search",
  handles: ["image"],
  async run(e, ctx) {
    if (process.env.REVERSE_IMAGE_UPLOAD === "0") return [];
    const buf = ctx.images?.[e.value];
    if (!buf) return [];

    const url = await hostImage(buf, e.value, ctx.signal);
    if (!url) {
      return [
        {
          source: "reverse-image",
          title: `Reverse search for ${e.value} (manual)`,
          severity: "info",
          detail: "Auto-host failed — upload the image manually at these engines.",
          data: {
            links: [
              { label: "Google Lens", url: "https://lens.google.com/" },
              { label: "Yandex Images", url: "https://yandex.com/images/" },
              { label: "TinEye", url: "https://tineye.com/" },
              { label: "Bing Visual", url: "https://www.bing.com/visualsearch" },
            ],
          },
        },
      ];
    }

    return [
      {
        source: "reverse-image",
        title: `Reverse image search ready: ${e.value}`,
        severity: "low",
        url,
        detail: "Image hosted publicly to enable URL-based reverse search. Click an engine to run it.",
        data: {
          hostedImage: url,
          links: [
            { label: "Google Lens", url: `https://lens.google.com/uploadbyurl?url=${q(url)}` },
            { label: "Yandex", url: `https://yandex.com/images/search?rpt=imageview&url=${q(url)}` },
            { label: "Bing Visual", url: `https://www.bing.com/images/searchbyimage?cbir=sbi&imgurl=${q(url)}` },
            { label: "TinEye", url: `https://www.tineye.com/search?url=${q(url)}` },
          ],
          privacy: "Image was uploaded to catbox.moe (public). Set REVERSE_IMAGE_UPLOAD=0 to disable.",
        },
      } as Finding,
    ];
  },
};

export default reverseSource;
