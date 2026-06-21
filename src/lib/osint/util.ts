import type { Entity, EntityType } from "./types";

export function entity(
  type: EntityType,
  value: string,
  source: string,
  confidence = 0.7,
  extra: Partial<Entity> = {},
): Entity {
  const v = value.trim();
  return {
    id: `${type}:${v.toLowerCase()}`,
    type,
    value: v,
    source,
    confidence,
    ...extra,
  };
}

/** Reject garbage entity values (empty, null-MX ".", malformed) before they enter the graph. */
export function isValidEntity(e: Entity): boolean {
  const v = e.value.trim();
  if (!v || v === "." || v.length > 2048) return false;
  switch (e.type) {
    case "domain":
      return /^(?=.{1,253}$)([a-z0-9](-?[a-z0-9])*\.)+[a-z]{2,}\.?$/i.test(v) && !v.includes("@");
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    case "ip":
      return /^[0-9a-f:.]+$/i.test(v);
    default:
      return true;
  }
}

const DEFAULT_TIMEOUT = 8000;

/** fetch with a timeout, merged with an optional upstream abort signal. */
export async function safeFetch(
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT,
  upstream?: AbortSignal,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  upstream?.addEventListener("abort", onAbort);
  try {
    return await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: {
        "user-agent":
          "osint-directory/0.1 (+research; respects-robots; public-sources-only)",
        ...(init.headers || {}),
      },
    });
  } finally {
    clearTimeout(timer);
    upstream?.removeEventListener("abort", onAbort);
  }
}

export function imageMediaType(name: string): string {
  const ext = name.toLowerCase().split(".").pop() || "";
  return (
    {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      gif: "image/gif",
      bmp: "image/bmp",
    }[ext] || "image/jpeg"
  );
}

export async function md5Hex(input: string): Promise<string> {
  // Node crypto (server side)
  const { createHash } = await import("node:crypto");
  return createHash("md5").update(input).digest("hex");
}

export async function sha256Hex(input: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(input).digest("hex");
}
