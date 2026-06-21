import type { Source, Finding, Entity } from "../types";
import { entity } from "../util";

const dnsSource: Source = {
  id: "dns",
  label: "DNS Records",
  handles: ["domain"],
  async run(e) {
    const dns = await import("node:dns/promises");
    const findings: Finding[] = [];
    const newEntities: Entity[] = [];
    const records: Record<string, string[]> = {};

    const tasks: Array<[string, Promise<unknown>]> = [
      ["A", dns.resolve4(e.value).catch(() => [])],
      ["AAAA", dns.resolve6(e.value).catch(() => [])],
      ["MX", dns.resolveMx(e.value).catch(() => [])],
      ["NS", dns.resolveNs(e.value).catch(() => [])],
      ["TXT", dns.resolveTxt(e.value).catch(() => [])],
      ["CNAME", dns.resolveCname(e.value).catch(() => [])],
    ];

    for (const [type, p] of tasks) {
      const res = (await p) as unknown[];
      if (!res.length) continue;
      const vals = res.map((r) => {
        if (type === "MX") {
          const m = r as { priority: number; exchange: string };
          return `${m.priority} ${m.exchange}`;
        }
        if (type === "TXT") return (r as string[]).join("");
        return String(r);
      });
      records[type] = vals;

      // pivot IPs into entities
      if (type === "A" || type === "AAAA") {
        for (const ip of vals) newEntities.push(entity("ip", ip, "dns", 0.9));
      }
      if (type === "MX") {
        for (const r of res as { exchange: string }[]) {
          newEntities.push(entity("domain", r.exchange, "dns", 0.55, { label: "mail server" }));
        }
      }
    }

    if (Object.keys(records).length) {
      findings.push({
        source: "dns",
        title: `DNS records for ${e.value}`,
        severity: "info",
        data: records,
        entities: newEntities,
      });
    }
    return findings;
  },
};

export default dnsSource;
