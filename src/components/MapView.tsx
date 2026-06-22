"use client";

import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import type { StyleSpecification } from "maplibre-gl";
import type { GeoPoint } from "@/lib/osint/types";

// Free, no-key vector basemap (OpenFreeMap). Custom dark monochrome style with
// 3D building extrusion (Google-Earth style). Forced to pure B/W via CSS filter.
const STYLE = {
  version: 8 as const,
  sources: {
    openmaptiles: {
      type: "vector" as const,
      url: "https://tiles.openfreemap.org/planet",
      attribution: "© OpenStreetMap · OpenFreeMap",
    },
  },
  layers: [
    { id: "bg", type: "background" as const, paint: { "background-color": "#1a1a1a" } },
    {
      id: "water",
      type: "fill" as const,
      source: "openmaptiles",
      "source-layer": "water",
      paint: { "fill-color": "#0d0d0d" },
    },
    {
      id: "roads",
      type: "line" as const,
      source: "openmaptiles",
      "source-layer": "transportation",
      minzoom: 7,
      paint: {
        "line-color": "#3a3a3a",
        "line-width": ["interpolate", ["linear"], ["zoom"], 7, 0.4, 16, 2.4],
      },
    },
    {
      id: "building-3d",
      type: "fill-extrusion" as const,
      source: "openmaptiles",
      "source-layer": "building",
      minzoom: 14,
      paint: {
        "fill-extrusion-color": [
          "interpolate",
          ["linear"],
          ["get", "render_height"],
          0,
          "#4a4a4a",
          40,
          "#666666",
          120,
          "#888888",
          300,
          "#aaaaaa",
        ],
        "fill-extrusion-height": ["get", "render_height"],
        "fill-extrusion-base": ["get", "render_min_height"],
        "fill-extrusion-opacity": 0.92,
      },
    },
  ],
};

export function MapView({ points }: { points: GeoPoint[] }) {
  const ref = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  const [globe, setGlobe] = useState(false); // flat mercator loads faster; globe is opt-in

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    let cancelled = false;

    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled || !ref.current) return;

      const map = new maplibregl.Map({
        container: ref.current,
        style: STYLE as unknown as StyleSpecification,
        center: points[0] ? [points[0].lon, points[0].lat] : [0, 20],
        zoom: points[0] ? 4 : 1.4,
        attributionControl: false,
        maxPitch: 85,
        fadeDuration: 0, // skip tile cross-fade for snappier loads
        refreshExpiredTiles: false,
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");

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

  function flyToFirst() {
    const map = mapRef.current;
    if (!map || !points[0]) return;
    map.flyTo({ center: [points[0].lon, points[0].lat], zoom: 16, pitch: 60, duration: 2500 });
  }

  if (!points.length) {
    return (
      <div className="rounded-md border border-border bg-panel p-4 text-xs text-muted">
        No geolocation data in this result. Geo points come from IP geolocation, image EXIF GPS,
        AI visual estimates, and geocoded place names.
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-md border border-border">
      <div
        ref={ref}
        className="h-[460px] w-full bg-neutral-900 [filter:grayscale(1)_contrast(1.02)_brightness(1.3)]"
      />
      <div className="absolute left-3 top-3 z-10 flex gap-1">
        <button
          onClick={toggle}
          className="rounded-sm border border-border bg-black/80 px-3 py-1.5 text-[11px] uppercase tracking-wider text-foreground backdrop-blur hover:bg-black"
        >
          {globe ? "▣ flatten (2D)" : "◉ globe (3D)"}
        </button>
        <button
          onClick={flyToFirst}
          className="rounded-sm border border-border bg-black/80 px-3 py-1.5 text-[11px] uppercase tracking-wider text-foreground backdrop-blur hover:bg-black"
        >
          ⛶ buildings
        </button>
      </div>
      <div className="absolute bottom-2 right-2 z-10 text-[9px] text-muted/70">
        © OpenStreetMap · OpenFreeMap · zoom in for 3D buildings
      </div>
    </div>
  );
}
