"use client";

import type { Attr, Subject } from "@/lib/osint/types";

function Conf({ c }: { c: number }) {
  return (
    <span className="ml-1 align-middle text-[9px] text-muted">{Math.round(c * 100)}%</span>
  );
}

/** A labeled slot. Empty -> dim em-dash. */
function Slot({
  label,
  attrs,
  single,
}: {
  label: string;
  attrs: Attr[];
  single?: boolean;
}) {
  const items = single ? attrs.slice(0, 1) : attrs;
  return (
    <div className="border-b border-border/60 py-2">
      <div className="text-[9px] uppercase tracking-[0.18em] text-muted">{label}</div>
      {items.length === 0 ? (
        <div className="mt-1 text-xs text-muted/40">—</div>
      ) : (
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
          {items.map((a, i) => (
            <span key={i} className="text-xs text-foreground">
              {a.label && a.label !== a.value ? (
                <span className="text-muted">{a.label}: </span>
              ) : null}
              {/^https?:\/\//.test(a.value) ? (
                <a href={a.value} target="_blank" rel="noreferrer" className="underline decoration-muted hover:decoration-foreground">
                  {a.value.replace(/^https?:\/\/(www\.)?/, "")}
                </a>
              ) : (
                a.value
              )}
              <Conf c={a.confidence} />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function Profile({ subject: s }: { subject?: Subject }) {
  if (!s) {
    return (
      <div className="rounded-md border border-border bg-panel p-4 text-xs text-muted">
        No subject profile in this result. Re-run the investigation (dev bundle may be stale —
        restart the dev server).
      </div>
    );
  }
  return (
    <div className="rounded-md border border-border bg-panel">
      {/* header */}
      <div className="flex items-center gap-3 border-b border-border p-4">
        {s.avatars[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={s.avatars[0]}
            alt=""
            className="h-12 w-12 rounded-sm border border-border object-cover grayscale"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-sm border border-border text-base text-muted">
            ?
          </div>
        )}
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">
            {s.primaryName?.value || "Unidentified subject"}
          </div>
          <div className="text-[10px] uppercase tracking-widest text-muted">
            {s.emails[0]?.value || s.usernames[0]?.value || "no primary identifier"}
          </div>
        </div>
      </div>

      {/* attribute grid */}
      <div className="grid grid-cols-1 gap-x-6 px-4 sm:grid-cols-2">
        <Slot label="Residence" attrs={s.residence ? [s.residence] : []} single />
        <Slot label="Age" attrs={s.age ? [s.age] : []} single />
        <Slot label="Birthdate" attrs={s.birthdate ? [s.birthdate] : []} single />
        <Slot label="Education" attrs={s.education} />
        <Slot label="Employer" attrs={s.employers} />
        <Slot label="Organizations" attrs={s.organizations} />
        <Slot label="Locations seen" attrs={s.locations} />
        <Slot label="Names / aliases" attrs={s.names} />
        <Slot label="Emails" attrs={s.emails} />
        <Slot label="Usernames" attrs={s.usernames} />
        <Slot label="Phones" attrs={s.phones} />
        <Slot label="Social profiles" attrs={s.socials} />
        <Slot label="Breaches" attrs={s.breaches} />
        <Slot label="Domains" attrs={s.domains} />
        <Slot label="IP addresses" attrs={s.ips} />
      </div>

      {/* excluded notice */}
      <div className="border-t border-border px-4 py-3 text-[10px] leading-relaxed text-muted">
        Not inferred by design: {s.excluded.join(" · ")}. No reliable public-source signal exists
        for these; inferring them is profiling, not intelligence.
      </div>
    </div>
  );
}
