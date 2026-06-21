import type { Source, Finding, Entity } from "../types";
import { entity, md5Hex, safeFetch } from "../util";

interface GravatarProfile {
  entry?: Array<{
    displayName?: string;
    aboutMe?: string;
    currentLocation?: string;
    accounts?: { url: string; shortname?: string; username?: string }[];
    urls?: { value: string; title?: string }[];
    thumbnailUrl?: string;
  }>;
}

const gravatarSource: Source = {
  id: "gravatar",
  label: "Gravatar Profile",
  handles: ["email"],
  async run(e, ctx) {
    const hash = await md5Hex(e.value.trim().toLowerCase());
    const res = await safeFetch(
      `https://www.gravatar.com/${hash}.json`,
      {},
      8000,
      ctx.signal,
    );
    if (!res.ok) return []; // 404 = no gravatar
    let data: GravatarProfile;
    try {
      data = (await res.json()) as GravatarProfile;
    } catch {
      return [];
    }
    const p = data.entry?.[0];
    if (!p) return [];

    const newEntities: Entity[] = [];
    if (p.displayName) newEntities.push(entity("name", p.displayName, "gravatar", 0.7));
    if (p.currentLocation)
      newEntities.push(entity("location", p.currentLocation, "gravatar", 0.6));
    for (const acc of p.accounts || []) {
      newEntities.push(
        entity("social_profile", acc.url, "gravatar", 0.8, {
          label: acc.shortname || acc.username,
        }),
      );
      if (acc.username) newEntities.push(entity("username", acc.username, "gravatar", 0.7));
    }

    return [
      {
        source: "gravatar",
        title: `Gravatar profile for ${e.value}`,
        severity: "low",
        url: `https://www.gravatar.com/${hash}`,
        data: {
          displayName: p.displayName,
          aboutMe: p.aboutMe,
          location: p.currentLocation,
          avatar: p.thumbnailUrl,
          accounts: (p.accounts || []).map((a) => a.url),
          urls: (p.urls || []).map((u) => u.value),
        },
        entities: newEntities,
      },
    ];
  },
};

export default gravatarSource;
