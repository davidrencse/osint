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

    const camera = [meta.Make, meta.Model].filter(Boolean).join(" ");
    const sw = meta.Software as string | undefined;

    return [
      {
        source: "exif",
        title: `EXIF metadata for ${e.value}`,
        severity: lat != null ? "medium" : "low",
        data: {
          gps: lat != null ? { lat, lon, map: `https://www.google.com/maps?q=${lat},${lon}` } : undefined,
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
