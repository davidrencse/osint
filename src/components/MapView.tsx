"use client";

import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoPoint } from "@/lib/osint/types";

// Free, no-key dark raster basemap (CARTO dark_nolabels). Forced to pure B/W via CSS filter.
const STYLE = {
  version: 8 as const,
  sources: {
    carto: {
      type: "raster" as const,
      tiles: [
        "https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png",
        "https://c.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap © CARTO",
    },
  },
  layers: [
    { id: "bg", type: "background" as const, paint: { "background-color": "#000000" } },
    { id: "carto", type: "raster" as const, source: "carto" },
  ],
};

export function MapView({ points }: { points: GeoPoint[] }) {
  const ref = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  const [globe, setGlobe] = useState(true);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    let cancelled = false;

    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled || !ref.current) return;

      const map = new maplibregl.Map({
        container: ref.current,
        style: STYLE,
        center: points[0] ? [points[0].lon, points[0].lat] : [0, 20],
        zoom: points[0] ? 4 : 1.4,
        attributionControl: false,
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

      map.on("style.load", () => {
        map.setProjection({ type: "globe" });
      });

      map.on("load", () => {
        const bounds = new maplibregl.LngLatBounds();
        for (const p of points) {
          const el = document.createElement("div");
          el.style.cssText =
            "width:12px;height:12px;border-radius:50%;background:#fff;box-shadow:0 0 0 2px #000,0 0 12px 3px rgba(255,255,255,.6);cursor:pointer";
          const popup = new maplibregl.Popup({ offset: 14, closeButton: false }).setHTML(
            `<div style="font:11px ui-monospace,monospace;color:#000">
               <b>${p.label}</b><br/>${p.source} · ${Math.round(p.confidence * 100)}%<br/>${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}
             </div>`,
          );
          new maplibregl.Marker({ element: el }).setLngLat([p.lon, p.lat]).setPopup(popup).addTo(map);
          bounds.extend([p.lon, p.lat]);
        }
        if (points.length > 1) map.fitBounds(bounds, { padding: 60, maxZoom: 8, duration: 0 });
      });
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [points]);

  function toggle() {
    const map = mapRef.current;
    if (!map) return;
    const next = !globe;
    setGlobe(next);
    map.setProjection({ type: next ? "globe" : "mercator" });
  }

  if (!points.length) {
    return (
      <div className="rounded-md border border-border bg-panel p-4 text-xs text-muted">
        No geolocation data in this result. Geo points come from IP geolocation and image EXIF GPS.
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-md border border-border">
      <div
        ref={ref}
        className="h-[460px] w-full bg-black [filter:grayscale(1)_contrast(1.15)_brightness(1.05)]"
      />
      <button
        onClick={toggle}
        className="absolute left-3 top-3 z-10 rounded-sm border border-border bg-black/80 px-3 py-1.5 text-[11px] uppercase tracking-wider text-foreground backdrop-blur hover:bg-black"
      >
        {globe ? "▣ flatten (2D)" : "◉ globe (3D)"}
      </button>
      <div className="absolute bottom-2 right-2 z-10 text-[9px] text-muted/70">
        © OpenStreetMap · CARTO
      </div>
    </div>
  );
}
