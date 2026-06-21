// Core OSINT engine types

export type EntityType =
  | "email"
  | "username"
  | "domain"
  | "ip"
  | "url"
  | "name"
  | "phone"
  | "person"
  | "image"
  | "location"
  | "breach"
  | "social_profile"
  | "certificate"
  | "dns_record"
  | "organization"
  | "age"
  | "birthdate"
  | "education"
  | "employer"
  | "avatar"
  | "unknown";

export type Severity = "info" | "low" | "medium" | "high";

export interface Entity {
  /** stable id: `${type}:${value}` lowercased */
  id: string;
  type: EntityType;
  value: string;
  label?: string;
  /** 0..1 — how sure we are this entity is real / relevant */
  confidence: number;
  /** which source produced it */
  source: string;
  meta?: Record<string, unknown>;
}

export interface Finding {
  source: string;
  title: string;
  detail?: string;
  url?: string;
  severity?: Severity;
  /** new entities discovered by this finding (fed back into the engine for pivoting) */
  entities?: Entity[];
  /** arbitrary structured payload for the UI */
  data?: Record<string, unknown>;
}

export interface SourceContext {
  /** API keys / config from env, surfaced to sources */
  keys: Record<string, string | undefined>;
  /** raw uploaded image buffers keyed by entity value (filename) */
  images?: Record<string, Buffer>;
  /** abort signal honoured by fetch calls */
  signal?: AbortSignal;
}

export interface Source {
  id: string;
  label: string;
  /** entity types this source can act on */
  handles: EntityType[];
  /** true if it needs an API key that is currently missing -> engine emits a "configure" note */
  requiresKey?: string;
  run(entity: Entity, ctx: SourceContext): Promise<Finding[]>;
}

export interface Attr {
  value: string;
  source: string;
  confidence: number;
  label?: string;
}

export interface Subject {
  primaryName?: Attr;
  names: Attr[];
  usernames: Attr[];
  emails: Attr[];
  phones: Attr[];
  age?: Attr;
  birthdate?: Attr;
  residence?: Attr;
  locations: Attr[];
  education: Attr[];
  employers: Attr[];
  organizations: Attr[];
  socials: Attr[];
  avatars: string[];
  breaches: Attr[];
  domains: Attr[];
  ips: Attr[];
  /** sensitive attributes deliberately not inferred */
  excluded: string[];
}

export interface GeoPoint {
  lat: number;
  lon: number;
  label: string;
  source: string;
  confidence: number;
}

export interface InvestigationResult {
  query: SeedInput[];
  subject: Subject;
  geo: GeoPoint[];
  entities: Entity[];
  findings: Finding[];
  /** sources skipped because a key was missing */
  skipped: { source: string; key: string }[];
  errors: { source: string; entity: string; message: string }[];
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}

export interface SeedInput {
  raw: string;
  type: EntityType;
  value: string;
}
