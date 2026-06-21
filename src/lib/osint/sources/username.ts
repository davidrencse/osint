import type { Source, Finding, Entity } from "../types";
import { entity, safeFetch } from "../util";

interface Site {
  name: string;
  url: (u: string) => string;
  /** "status": 200 => exists. "absent": exists unless errorText present in body */
  method?: "status" | "absent";
  errorText?: string;
}

// Public profile-URL probes (Sherlock-style). Public pages only.
const SITES: Site[] = [
  { name: "GitHub", url: (u) => `https://github.com/${u}` },
  { name: "GitLab", url: (u) => `https://gitlab.com/${u}` },
  { name: "Reddit", url: (u) => `https://www.reddit.com/user/${u}/about.json` },
  { name: "Instagram", url: (u) => `https://www.instagram.com/${u}/` },
  { name: "X / Twitter", url: (u) => `https://nitter.net/${u}` },
  { name: "Telegram", url: (u) => `https://t.me/${u}`, method: "absent", errorText: "tgme_page_additional" },
  { name: "Twitch", url: (u) => `https://www.twitch.tv/${u}` },
  { name: "Pinterest", url: (u) => `https://www.pinterest.com/${u}/` },
  { name: "Medium", url: (u) => `https://medium.com/@${u}` },
  { name: "Steam", url: (u) => `https://steamcommunity.com/id/${u}` },
  { name: "Dribbble", url: (u) => `https://dribbble.com/${u}` },
  { name: "Behance", url: (u) => `https://www.behance.net/${u}` },
  { name: "Keybase", url: (u) => `https://keybase.io/${u}` },
  { name: "DEV", url: (u) => `https://dev.to/${u}` },
  { name: "HackerNews", url: (u) => `https://news.ycombinator.com/user?id=${u}`, method: "absent", errorText: "No such user" },
  { name: "Replit", url: (u) => `https://replit.com/@${u}` },
  { name: "SoundCloud", url: (u) => `https://soundcloud.com/${u}` },
  { name: "Vimeo", url: (u) => `https://vimeo.com/${u}` },
  { name: "Patreon", url: (u) => `https://www.patreon.com/${u}` },
  { name: "Flickr", url: (u) => `https://www.flickr.com/people/${u}` },
  { name: "Spotify", url: (u) => `https://open.spotify.com/user/${u}` },
  { name: "AboutMe", url: (u) => `https://about.me/${u}` },
  { name: "Gravatar", url: (u) => `https://gravatar.com/${u}` },
  { name: "Mastodon (.social)", url: (u) => `https://mastodon.social/@${u}` },
  { name: "ProductHunt", url: (u) => `https://www.producthunt.com/@${u}` },
];

async function probe(site: Site, u: string, signal?: AbortSignal) {
  try {
    const res = await safeFetch(site.url(u), { redirect: "follow" }, 7000, signal);
    if ((site.method ?? "status") === "status") {
      return res.status === 200;
    }
    // absent method
    if (res.status !== 200) return false;
    const body = await res.text();
    return site.errorText ? !body.includes(site.errorText) : true;
  } catch {
    return null; // error/timeout -> unknown
  }
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

const usernameSource: Source = {
  id: "username-enum",
  label: "Username Enumeration",
  handles: ["username"],
  async run(e, ctx) {
    const u = e.value;
    const results = await pool(SITES, 8, (s) =>
      probe(s, u, ctx.signal).then((found) => ({ site: s, found })),
    );

    const present = results.filter((r) => r.found === true);
    const unknown = results.filter((r) => r.found === null);
    const newEntities: Entity[] = present.map((r) =>
      entity("social_profile", r.site.url(u), "username-enum", 0.7, { label: r.site.name }),
    );

    return [
      {
        source: "username-enum",
        title: `"${u}" found on ${present.length}/${SITES.length} platforms`,
        severity: present.length ? "low" : "info",
        data: {
          found: present.map((r) => ({ site: r.site.name, url: r.site.url(u) })),
          inconclusive: unknown.map((r) => r.site.name),
        },
        entities: newEntities,
      },
    ];
  },
};

export default usernameSource;
