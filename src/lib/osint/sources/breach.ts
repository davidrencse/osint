import type { Source, Finding, Entity } from "../types";
import { entity, safeFetch } from "../util";

interface HibpBreach {
  Name: string;
  Title: string;
  BreachDate: string;
  PwnCount: number;
  DataClasses: string[];
}

// HaveIBeenPwned breach lookup. Requires HIBP_API_KEY (paid). Falls back to a
// link-out via the dorks source when the key is missing.
const breachSource: Source = {
  id: "hibp",
  label: "HaveIBeenPwned Breaches",
  handles: ["email"],
  requiresKey: "HIBP_API_KEY",
  async run(e, ctx) {
    const key = ctx.keys.HIBP_API_KEY;
    if (!key) return [];
    const res = await safeFetch(
      `https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(
        e.value,
      )}?truncateResponse=false`,
      { headers: { "hibp-api-key": key } },
      9000,
      ctx.signal,
    );
    if (res.status === 404) {
      return [
        {
          source: "hibp",
          title: `No known breaches for ${e.value}`,
          severity: "info",
        },
      ];
    }
    if (!res.ok) return [];
    const breaches = (await res.json()) as HibpBreach[];
    const newEntities: Entity[] = breaches.map((b) =>
      entity("breach", b.Name, "hibp", 0.95, { label: b.Title }),
    );
    return [
      {
        source: "hibp",
        title: `${breaches.length} breaches expose ${e.value}`,
        severity: "high",
        data: {
          breaches: breaches.map((b) => ({
            name: b.Title,
            date: b.BreachDate,
            accounts: b.PwnCount,
            exposed: b.DataClasses,
          })),
        },
        entities: newEntities,
      },
    ];
  },
};

export default breachSource;
