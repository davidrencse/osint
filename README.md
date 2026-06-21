# OSINT Directory

Public-source intelligence aggregator. Paste mixed inputs (emails, usernames, domains,
IPs, names, phone numbers) and/or upload images — it classifies each input, runs it through
multiple free OSINT sources in parallel, **pivots** on discovered entities, and returns a
correlated graph of entities + findings.

> ⚠️ **Authorized use only.** Hits free, public sources (RDAP, DNS, certificate transparency,
> Gravatar, public profile pages). No login-gated scraping, no harassment tooling. You are
> responsible for lawful and ethical use.

## Run

```bash
npm install
cp .env.example .env.local   # optional API keys
npm run dev                  # http://localhost:3000
```

## The engine ("our own")

`src/lib/osint/engine.ts` is the correlation engine:

1. **Classify** — `classify.ts` parses the free-text blob into typed seed entities
   (email / username / domain / ip / url / name / phone), plus uploaded images.
2. **Dispatch** — every source declaring it `handles` an entity type runs against it,
   in parallel, with per-call timeouts and abort propagation.
3. **Pivot** — entities discovered in pass 1 (confidence ≥ 0.6, capped at 40) feed a second
   dispatch pass, e.g. domain → DNS A record → IP → geolocation. Low-confidence noise
   (subdomains, NS/MX hosts at 0.55) is surfaced but not re-scanned to avoid fan-out blowups.
4. **Correlate** — entities deduped by `type:value` id, validated (`isValidEntity`), ranked
   by confidence.

## Sources

| Source | Input | Key | What |
|---|---|---|---|
| `dns` | domain | — | A/AAAA/MX/NS/TXT/CNAME, pivots IPs |
| `rdap` | domain, ip | — | RDAP/WHOIS: registrar, dates, contacts, netblock |
| `crtsh` | domain | — | Subdomains via certificate transparency |
| `ipgeo` | ip | — | Geolocation, ISP, ASN, reverse DNS |
| `gravatar` | email | — | Profile, linked accounts, avatar |
| `email-analyze` | email | — | MX deliverability, disposable/role flags, name inference |
| `username-enum` | username | — | Sherlock-style presence check across ~25 platforms |
| `exif` | image | — | EXIF/GPS, camera, timestamp, software |
| `dorks` | all | — | Curated manual-pivot search links |
| `hibp` | email | `HIBP_API_KEY` | HaveIBeenPwned breaches (paid key) |

Key-gated sources are skipped with a UI note when the key is unset.

## Add a source

Implement the `Source` interface (`src/lib/osint/types.ts`) — declare `handles`, return
`Finding[]` (each may carry new `entities` for pivoting) — and register it in the `SOURCES`
array in `engine.ts`. That's it.

## API

`POST /api/investigate` — JSON `{ "query": "..." }` or `multipart/form-data` with `query`
field + `images` files. Returns `InvestigationResult`.
# osint
