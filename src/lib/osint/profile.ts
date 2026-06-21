import type { Attr, Entity, Finding, Subject } from "./types";

/** Collapse entities of a type into deduped attributes, max-confidence per value. */
function collect(entities: Entity[], type: string): Attr[] {
  const map = new Map<string, Attr>();
  for (const e of entities) {
    if (e.type !== type) continue;
    const key = e.value.toLowerCase();
    const prev = map.get(key);
    if (!prev || e.confidence > prev.confidence) {
      map.set(key, { value: e.value, source: e.source, confidence: e.confidence, label: e.label });
    }
  }
  return [...map.values()].sort((a, b) => b.confidence - a.confidence);
}

const best = (a: Attr[]): Attr | undefined => a[0];

/**
 * Project the collected entity graph into a structured subject profile.
 * Surfaces ONLY data sources actually returned — no inference, no fabrication.
 * Sensitive attributes (race/ethnicity, religion, sexual orientation, health,
 * politics) are deliberately excluded: no reliable public-source signal exists
 * and inferring them is discriminatory profiling, not OSINT.
 */
export function buildSubject(entities: Entity[], findings: Finding[]): Subject {
  const names = collect(entities, "name");

  // avatars: pull image URLs out of gravatar findings
  const avatars: string[] = [];
  for (const f of findings) {
    const av = (f.data as Record<string, unknown> | undefined)?.avatar;
    if (typeof av === "string" && av) avatars.push(av);
  }

  const locations = collect(entities, "location");

  return {
    primaryName: best(names),
    names,
    usernames: collect(entities, "username"),
    emails: collect(entities, "email"),
    phones: collect(entities, "phone"),
    age: best(collect(entities, "age")),
    birthdate: best(collect(entities, "birthdate")),
    residence: best(locations),
    locations,
    education: collect(entities, "education"),
    employers: collect(entities, "employer"),
    organizations: collect(entities, "organization"),
    socials: collect(entities, "social_profile"),
    avatars: [...new Set(avatars)],
    breaches: collect(entities, "breach"),
    domains: collect(entities, "domain"),
    ips: collect(entities, "ip"),
    excluded: ["race / ethnicity", "religion", "sexual orientation", "health", "politics"],
  };
}
