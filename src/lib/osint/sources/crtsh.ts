import type { Source, Finding, Entity } from "../types";
import { entity, safeFetch } from "../util";

const crtshSource: Source = {
  id: "crtsh",
  label: "Certificate Transparency (crt.sh)",
  handles: ["domain"],
  async run(e, ctx) {
    const url = `https://crt.sh/?q=${encodeURIComponent("%." + e.value)}&output=json`;
    const res = await safeFetch(url, {}, 12000, ctx.signal);
    if (!res.ok) return [];
    let rows: { name_value: string; issuer_name: string }[];
    try {
      rows = (await res.json()) as typeof rows;
    } catch {
      return [];
    }

    const subs = new Set<string>();
    for (const r of rows) {
      for (const n of r.name_value.split(/\n/)) {
        const name = n.trim().toLowerCase().replace(/^\*\./, "");
        if (name.endsWith(e.value) && name !== e.value) subs.add(name);
      }
    }

    if (!subs.size) return [];
    const list = [...subs].sort();
    const newEntities: Entity[] = list
      .slice(0, 100)
      // 0.55 < pivot threshold (0.6): surfaced as entities but not re-scanned
      .map((s) => entity("domain", s, "crtsh", 0.55, { label: "subdomain" }));

    return [
      {
        source: "crtsh",
        title: `${list.length} subdomains via certificate transparency`,
        severity: "low",
        url: `https://crt.sh/?q=${encodeURIComponent("%." + e.value)}`,
        data: { subdomains: list },
        entities: newEntities,
      },
    ];
  },
};

export default crtshSource;
