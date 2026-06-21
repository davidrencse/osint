import type { Source, Finding, Entity } from "../types";
import { entity } from "../util";

const exifSource: Source = {
  id: "exif",
  label: "Image EXIF / Metadata",
  handles: ["image"],
  async run(e, ctx) {
    const buf = ctx.images?.[e.value];
    if (!buf) return [];
    const exifr = (await import("exifr")).default;

    let meta: Record<string, unknown> | undefined;
    try {
      meta = (await exifr.parse(buf, true)) as Record<string, unknown> | undefined;
    } catch {
      return [];
    }
    if (!meta) {
      return [
        {
          source: "exif",
          title: `No EXIF metadata in ${e.value}`,
          severity: "info",
          detail: "Image carries no embedded metadata (may have been stripped).",
        },
      ];
    }

    const newEntities: Entity[] = [];
    const lat = meta.latitude as number | undefined;
    const lon = meta.longitude as number | undefined;
    if (lat != null && lon != null) {
      newEntities.push(
        entity("location", `${lat}, ${lon}`, "exif", 0.9, {
          label: "GPS from photo",
          meta: { lat, lon, map: `https://www.google.com/maps?q=${lat},${lon}` },
        }),
      );
    }

    // IPTC / XMP embedded place names (present in many photos even without GPS).
    // Field names vary across writers — check the common variants.
    const pick = (...keys: string[]) => {
      for (const k of keys) {
        const v = meta?.[k];
        if (typeof v === "string" && v.trim()) return v.trim();
      }
      return undefined;
    };
    const city = pick("City");
    const state = pick("State", "Province/State", "ProvinceState");
    const country = pick("Country", "Country/PrimaryLocationName", "CountryPrimaryLocationName", "CountryCode");
    const sublocation = pick("Sub-location", "Sublocation", "Location");
    const placeText = [sublocation, city, state, country].filter(Boolean).join(", ");

    // Only emit a text location when we don't already have exact GPS — geocode
    // source will turn this text into coords for the map.
    if (placeText && lat == null) {
      newEntities.push(
        entity("location", placeText, "exif", 0.7, { label: "IPTC/XMP place tag" }),
      );
    }

    const camera = [meta.Make, meta.Model].filter(Boolean).join(" ");
    const sw = meta.Software as string | undefined;

    return [
      {
        source: "exif",
        title: `EXIF metadata for ${e.value}`,
        severity: lat != null || placeText ? "medium" : "low",
        data: {
          gps: lat != null ? { lat, lon, map: `https://www.google.com/maps?q=${lat},${lon}` } : undefined,
          place: placeText || undefined,
          camera: camera || undefined,
          software: sw,
          taken: (meta.DateTimeOriginal as Date | undefined)?.toString?.(),
          dimensions:
            meta.ImageWidth && meta.ImageHeight
              ? `${meta.ImageWidth}x${meta.ImageHeight}`
              : undefined,
          artist: meta.Artist,
          copyright: meta.Copyright,
        },
        entities: newEntities,
      },
    ];
  },
};

export default exifSource;
