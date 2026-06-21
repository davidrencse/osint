import type { Source, Finding, Entity } from "../types";
import { entity, safeFetch } from "../util";

interface IpApiResponse {
  status: string;
  country?: string;
  regionName?: string;
  city?: string;
  zip?: string;
  lat?: number;
  lon?: number;
  isp?: string;
  org?: string;
  as?: string;
  reverse?: string;
  message?: string;
}

const ipgeoSource: Source = {
  id: "ipgeo",
  label: "IP Geolocation (ip-api.com)",
  handles: ["ip"],
  async run(e, ctx) {
    const url = `http://ip-api.com/json/${encodeURIComponent(
      e.value,
    )}?fields=status,message,country,regionName,city,zip,lat,lon,isp,org,as,reverse`;
    const res = await safeFetch(url, {}, 8000, ctx.signal);
    if (!res.ok) return [];
    const d = (await res.json()) as IpApiResponse;
    if (d.status !== "success") return [];

    const newEntities: Entity[] = [];
    if (d.city || d.country) {
      const loc = [d.city, d.regionName, d.country].filter(Boolean).join(", ");
      newEntities.push(
        entity("location", loc, "ipgeo", 0.5, { meta: { lat: d.lat, lon: d.lon } }),
      );
    }
    if (d.org) newEntities.push(entity("organization", d.org, "ipgeo", 0.6));

    return [
      {
        source: "ipgeo",
        title: `Geolocation for ${e.value}`,
        severity: "info",
        data: {
          location: [d.city, d.regionName, d.country].filter(Boolean).join(", "),
          coords: d.lat != null ? `${d.lat}, ${d.lon}` : undefined,
          isp: d.isp,
          org: d.org,
          asn: d.as,
          reverseDns: d.reverse,
        },
        entities: newEntities,
      },
    ];
  },
};

export default ipgeoSource;
