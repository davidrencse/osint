import type { Source, Finding } from "../types";

const q = (s: string) => encodeURIComponent(s);

const dorksSource: Source = {
  id: "dorks",
  label: "Search Pivots & Dorks",
  handles: ["name", "email", "username", "phone", "image", "domain"],
  async run(e) {
    const v = e.value;
    const links: { label: string; url: string }[] = [];

    if (e.type === "name") {
      links.push(
        { label: "Google exact", url: `https://www.google.com/search?q=${q(`"${v}"`)}` },
        { label: "LinkedIn", url: `https://www.google.com/search?q=${q(`"${v}" site:linkedin.com/in`)}` },
        { label: "Instagram", url: `https://www.google.com/search?q=${q(`"${v}" site:instagram.com`)}` },
        { label: "Facebook", url: `https://www.facebook.com/search/people/?q=${q(v)}` },
        { label: "X / Twitter", url: `https://x.com/search?q=${q(v)}&f=user` },
        { label: "Reddit", url: `https://www.google.com/search?q=${q(`"${v}" site:reddit.com`)}` },
        { label: "TikTok", url: `https://www.google.com/search?q=${q(`"${v}" site:tiktok.com`)}` },
        { label: "YouTube", url: `https://www.youtube.com/results?search_query=${q(v)}` },
        { label: "Documents (pdf/doc)", url: `https://www.google.com/search?q=${q(`"${v}" filetype:pdf OR filetype:docx`)}` },
        { label: "ThatsThem", url: `https://thatsthem.com/name/${q(v.replace(/\s+/g, "-"))}` },
      );
    }
    if (e.type === "email") {
      links.push(
        { label: "Google", url: `https://www.google.com/search?q=${q(`"${v}"`)}` },
        { label: "HaveIBeenPwned", url: `https://haveibeenpwned.com/account/${q(v)}` },
        { label: "Pastebin dorks", url: `https://www.google.com/search?q=${q(`"${v}" site:pastebin.com`)}` },
        { label: "EmailRep", url: `https://emailrep.io/${q(v)}` },
      );
    }
    if (e.type === "username") {
      links.push(
        { label: "Google", url: `https://www.google.com/search?q=${q(`"${v}"`)}` },
        { label: "WhatsMyName", url: `https://whatsmyname.app/?q=${q(v)}` },
        // direct profile guesses (unverified — walled networks can't be auto-checked)
        { label: "Instagram →", url: `https://www.instagram.com/${v}/` },
        { label: "Facebook →", url: `https://www.facebook.com/${v}` },
        { label: "X / Twitter →", url: `https://x.com/${v}` },
        { label: "TikTok →", url: `https://www.tiktok.com/@${v}` },
        { label: "YouTube →", url: `https://www.youtube.com/@${v}` },
        { label: "LinkedIn (search)", url: `https://www.google.com/search?q=${q(`"${v}" site:linkedin.com`)}` },
      );
    }
    if (e.type === "phone") {
      links.push(
        { label: "Google", url: `https://www.google.com/search?q=${q(`"${v}"`)}` },
        { label: "TrueCaller", url: `https://www.truecaller.com/search/intl/${q(v)}` },
        { label: "Sync.me", url: `https://sync.me/search/?number=${q(v)}` },
      );
    }
    if (e.type === "domain") {
      links.push(
        { label: "Wayback Machine", url: `https://web.archive.org/web/*/${q(v)}` },
        { label: "Google site:", url: `https://www.google.com/search?q=${q(`site:${v}`)}` },
        { label: "Shodan", url: `https://www.shodan.io/search?query=${q(v)}` },
        { label: "URLScan", url: `https://urlscan.io/search/#${q(v)}` },
      );
    }
    if (e.type === "image") {
      links.push(
        { label: "Google Lens", url: `https://lens.google.com/` },
        { label: "Yandex Images", url: `https://yandex.com/images/` },
        { label: "TinEye", url: `https://tineye.com/` },
        { label: "PimEyes (faces)", url: `https://pimeyes.com/en` },
      );
    }

    if (!links.length) return [];
    return [
      {
        source: "dorks",
        title: `Manual pivots for ${e.type}: ${v}`,
        severity: "info",
        data: { links },
      } as Finding,
    ];
  },
};

export default dorksSource;
