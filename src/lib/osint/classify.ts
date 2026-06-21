import type { EntityType, SeedInput } from "./types";

const RE = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  ip: /^(\d{1,3}\.){3}\d{1,3}$|^[0-9a-f:]+:[0-9a-f:]+$/i,
  url: /^https?:\/\/\S+$/i,
  domain: /^(?=.{1,253}$)([a-z0-9](-?[a-z0-9])*\.)+[a-z]{2,}$/i,
  phone: /^\+?[0-9][0-9\s().-]{6,}[0-9]$/,
  username: /^@?[a-z0-9._-]{2,40}$/i,
};

/** Classify a single raw token into an entity type. */
export function classifyToken(raw: string): EntityType {
  const t = raw.trim();
  if (!t) return "unknown";
  if (RE.email.test(t)) return "email";
  if (RE.url.test(t)) return "url";
  if (RE.ip.test(t)) return "ip";
  if (RE.domain.test(t)) return "domain";
  if (RE.phone.test(t)) return "phone";
  // names: contains a space and looks like words
  if (/\s/.test(t) && /^[\p{L}.''-]+(\s+[\p{L}.''-]+)+$/u.test(t)) return "name";
  if (RE.username.test(t)) return "username";
  return "unknown";
}

/** Normalize a raw value for a given type (strip @, lowercase, etc). */
export function normalize(type: EntityType, raw: string): string {
  const t = raw.trim();
  switch (type) {
    case "email":
    case "domain":
    case "ip":
      return t.toLowerCase();
    case "username":
      return t.replace(/^@/, "").toLowerCase();
    case "url":
      return t;
    case "name":
      return t.replace(/\s+/g, " ");
    default:
      return t;
  }
}

/**
 * Parse a free-text blob into seed inputs. Splits on newlines and commas,
 * keeping multi-word names intact (no comma/newline).
 */
export function parseInputs(blob: string): SeedInput[] {
  const seeds: SeedInput[] = [];
  const seen = new Set<string>();
  for (const line of blob.split(/[\n,]+/)) {
    const raw = line.trim();
    if (!raw) continue;
    const type = classifyToken(raw);
    if (type === "unknown") continue;
    const value = normalize(type, raw);
    const key = `${type}:${value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    seeds.push({ raw, type, value });
  }
  return seeds;
}
