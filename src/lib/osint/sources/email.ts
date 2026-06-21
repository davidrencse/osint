import type { Source, Finding, Entity } from "../types";
import { entity, md5Hex } from "../util";

// disposable / role-account heuristics
const DISPOSABLE = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "10minutemail.com",
  "tempmail.com",
  "trashmail.com",
  "yopmail.com",
]);
const ROLE = new Set([
  "admin",
  "info",
  "support",
  "contact",
  "sales",
  "hello",
  "noreply",
  "no-reply",
  "webmaster",
  "postmaster",
]);

const emailSource: Source = {
  id: "email-analyze",
  label: "Email Analysis",
  handles: ["email"],
  async run(e) {
    const [local, domain] = e.value.split("@");
    if (!domain) return [];

    const dns = await import("node:dns/promises");
    const mx = await dns.resolveMx(domain).catch(() => []);
    const deliverable = mx.length > 0;

    const flags: string[] = [];
    if (DISPOSABLE.has(domain)) flags.push("disposable provider");
    if (ROLE.has(local.toLowerCase())) flags.push("role account");
    if (!deliverable) flags.push("no MX record (likely undeliverable)");

    const newEntities: Entity[] = [
      entity("domain", domain, "email-analyze", 0.8, { label: "email domain" }),
    ];

    // guess possible names from local part
    const nameGuess = local
      .replace(/[._-]+/g, " ")
      .replace(/\d+/g, "")
      .trim();
    if (nameGuess.includes(" ") && nameGuess.length > 3) {
      newEntities.push(
        entity("name", nameGuess, "email-analyze", 0.3, { label: "inferred from local-part" }),
      );
    }
    newEntities.push(entity("username", local, "email-analyze", 0.4, { label: "email local-part" }));

    return [
      {
        source: "email-analyze",
        title: `Email breakdown: ${e.value}`,
        severity: flags.length ? "low" : "info",
        data: {
          localPart: local,
          domain,
          deliverable,
          mxHosts: mx.map((m) => m.exchange),
          gravatarHash: await md5Hex(e.value.toLowerCase()),
          flags,
        },
        entities: newEntities,
      },
    ];
  },
};

export default emailSource;
