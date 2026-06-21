import { imageMediaType, safeFetch } from "./util";

// Provider-agnostic vision client. Talks to any OpenAI-compatible chat endpoint
// that accepts image_url content parts. Swap providers via env only:
//
//   Groq (default, free):  VISION_API_KEY=gsk_...   (or GROQ_API_KEY)
//   Gemini (free tier):    VISION_API_KEY=...  VISION_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai  VISION_MODEL=gemini-2.0-flash
//   OpenRouter / others:   set the three vars accordingly

export const VISION_MAX_BYTES = 4 * 1024 * 1024; // most free tiers cap base64 images ~4MB

export interface VisionConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export function visionConfig(keys: Record<string, string | undefined>): VisionConfig | null {
  const apiKey = keys.VISION_API_KEY;
  if (!apiKey) return null;
  return {
    baseUrl: (process.env.VISION_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/$/, ""),
    apiKey,
    model: process.env.VISION_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct",
  };
}

function extractJson<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    const a = text.indexOf("{");
    const b = text.lastIndexOf("}");
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(text.slice(a, b + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** Send an image + prompt, expect a JSON object back, parse it. Throws on failure. */
export async function analyzeImageJson<T>(opts: {
  buffer: Buffer;
  filename: string;
  prompt: string;
  cfg: VisionConfig;
  signal?: AbortSignal;
}): Promise<T> {
  const { buffer, filename, prompt, cfg, signal } = opts;
  const dataUrl = `data:${imageMediaType(filename)};base64,${buffer.toString("base64")}`;

  const res = await safeFetch(
    `${cfg.baseUrl}/chat/completions`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${cfg.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.2,
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    },
    25000,
    signal,
  );

  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`vision ${cfg.model} ${res.status}: ${msg.slice(0, 200)}`);
  }
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = j.choices?.[0]?.message?.content || "";
  const parsed = extractJson<T>(content);
  if (!parsed) throw new Error("vision model returned unparseable JSON");
  return parsed;
}
