import type { Source, Finding, Entity } from "../types";
import { entity, safeFetch } from "../util";

/**
 * Deep profile extraction for platforms exposing free, unauthenticated data APIs
 * (GitHub, Reddit). Pulls real attributes — name, employer, location, email,
 * linked accounts, avatar — not just presence. Walled platforms (IG/LinkedIn/FB/X)
 * are handled by username-enum (presence) + dorks (search links).
 */

interface GhUser {
  login: string;
  name?: string;
  company?: string;
  blog?: string;
  location?: string;
  email?: string;
  bio?: string;
  twitter_username?: string;
  followers?: number;
  public_repos?: number;
  created_at?: string;
  avatar_url?: string;
  html_url?: string;
}

interface RdUser {
  data?: {
    name?: string;
    created_utc?: number;
    total_karma?: number;
    verified?: boolean;
    icon_img?: string;
    subreddit?: { title?: string; public_description?: string };
  };
}

async function github(u: string, signal?: AbortSignal): Promise<Finding[]> {
  const res = await safeFetch(
    `https://api.github.com/users/${encodeURIComponent(u)}`,
    { headers: { accept: "application/vnd.github+json" } },
    8000,
    signal,
  );
  if (!res.ok) return [];
  const d = (await res.json()) as GhUser;
  if (!d.login) return [];

  const ents: Entity[] = [
    entity("social_profile", d.html_url || `https://github.com/${d.login}`, "github", 0.95, {
      label: "GitHub",
    }),
  ];
  if (d.name) ents.push(entity("name", d.name, "github", 0.8));
  if (d.location) ents.push(entity("location", d.location, "github", 0.6));
  if (d.company)
    ents.push(entity("employer", d.company.replace(/^@/, ""), "github", 0.7));
  if (d.email && /@/.test(d.email)) ents.push(entity("email", d.email, "github", 0.85));
  if (d.blog && /\./.test(d.blog)) {
    const url = d.blog.startsWith("http") ? d.blog : `https://${d.blog}`;
    ents.push(entity("url", url, "github", 0.5, { label: "personal site" }));
  }
  if (d.twitter_username) {
    ents.push(entity("username", d.twitter_username, "github", 0.7, { label: "X/Twitter" }));
    ents.push(
      entity("social_profile", `https://x.com/${d.twitter_username}`, "github", 0.7, { label: "X" }),
    );
  }

  return [
    {
      source: "github",
      title: `GitHub: ${d.name || d.login}`,
      severity: "low",
      url: d.html_url,
      data: {
        avatar: d.avatar_url,
        name: d.name,
        bio: d.bio,
        company: d.company,
        location: d.location,
        email: d.email,
        blog: d.blog,
        twitter: d.twitter_username,
        followers: d.followers,
        repos: d.public_repos,
        joined: d.created_at?.slice(0, 10),
      },
      entities: ents,
    },
  ];
}

async function reddit(u: string, signal?: AbortSignal): Promise<Finding[]> {
  const res = await safeFetch(
    `https://www.reddit.com/user/${encodeURIComponent(u)}/about.json`,
    { headers: { accept: "application/json" } },
    8000,
    signal,
  );
  if (!res.ok) return [];
  let d: RdUser;
  try {
    d = (await res.json()) as RdUser;
  } catch {
    return [];
  }
  if (!d.data) return [];
  const a = d.data;

  const ents: Entity[] = [
    entity("social_profile", `https://www.reddit.com/user/${u}`, "reddit", 0.9, { label: "Reddit" }),
  ];
  if (a.subreddit?.title && a.subreddit.title !== u)
    ents.push(entity("name", a.subreddit.title, "reddit", 0.4, { label: "reddit display name" }));

  return [
    {
      source: "reddit",
      title: `Reddit: u/${u}`,
      severity: "low",
      url: `https://www.reddit.com/user/${u}`,
      data: {
        avatar: a.icon_img?.split("?")[0],
        displayName: a.subreddit?.title,
        bio: a.subreddit?.public_description,
        karma: a.total_karma,
        verified: a.verified,
        created: a.created_utc ? new Date(a.created_utc * 1000).toISOString().slice(0, 10) : undefined,
      },
      entities: ents,
    },
  ];
}

const socialSource: Source = {
  id: "social",
  label: "Social Profiles (deep)",
  handles: ["username"],
  async run(e, ctx) {
    const u = e.value;
    const [gh, rd] = await Promise.all([
      github(u, ctx.signal).catch(() => []),
      reddit(u, ctx.signal).catch(() => []),
    ]);
    return [...gh, ...rd];
  },
};

export default socialSource;
