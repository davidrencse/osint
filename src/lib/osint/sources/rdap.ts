import type { Source, Finding, Entity } from "../types";
import { entity, safeFetch } from "../util";

interface RdapEntity {
  roles?: string[];
  vcardArray?: [string, unknown[]];
}
interface RdapResponse {
  handle?: string;
  ldhName?: string;
  events?: { eventAction: string; eventDate: string }[];
  entities?: RdapEntity[];
  nameservers?: { ldhName: string }[];
  status?: string[];
  startAddress?: string;
  endAddress?: string;
  country?: string;
  name?: string;
}

function vcardField(ent: RdapEntity, field: string): string | undefined {
  const arr = ent.vcardArray?.[1] as unknown[][] | undefined;
  if (!arr) return undefined;
  const row = arr.find((r) => r[0] === field);
  return row ? String(row[3]) : undefined;
}

const rdapSource: Source = {
  id: "rdap",
  label: "RDAP / WHOIS",
  handles: ["domain", "ip"],
  async run(e, ctx) {
    const url =
      e.type === "ip"
        ? `https://rdap.org/ip/${encodeURIComponent(e.value)}`
        : `https://rdap.org/domain/${encodeURIComponent(e.value)}`;
    const res = await safeFetch(url, {}, 8000, ctx.signal);
    if (!res.ok) return [];
    const data = (await res.json()) as RdapResponse;

    const newEntities: Entity[] = [];
    const summary: Record<string, unknown> = {};

    if (data.events?.length) {
      summary.events = Object.fromEntries(
        data.events.map((ev) => [ev.eventAction, ev.eventDate]),
      );
    }
    if (data.status?.length) summary.status = data.status;
    if (data.nameservers?.length) {
      summary.nameservers = data.nameservers.map((n) => n.ldhName);
      for (const ns of data.nameservers)
        newEntities.push(entity("domain", ns.ldhName, "rdap", 0.55, { label: "nameserver" }));
    }
    if (e.type === "ip") {
      if (data.name) summary.netname = data.name;
      if (data.country) summary.country = data.country;
      if (data.startAddress) summary.range = `${data.startAddress} - ${data.endAddress}`;
    }

    for (const ent of data.entities || []) {
      const org = vcardField(ent, "org") || vcardField(ent, "fn");
      const email = vcardField(ent, "email");
      const role = ent.roles?.join(",") || "contact";
      if (org) {
        summary[`${role}_org`] = org;
        newEntities.push(entity("organization", org, "rdap", 0.6, { label: role }));
      }
      if (email && /@/.test(email)) {
        summary[`${role}_email`] = email;
        newEntities.push(entity("email", email, "rdap", 0.7, { label: `${role} contact` }));
      }
    }

    if (!Object.keys(summary).length) return [];
    return [
      {
        source: "rdap",
        title: `Registration data for ${e.value}`,
        severity: "info",
        data: summary,
        entities: newEntities,
      },
    ];
  },
};

export default rdapSource;
