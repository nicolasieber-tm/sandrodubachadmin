'use client';

// Karten-Picker fuer Wegkosten-Regeln: Klick auf die Karte setzt den
// Bezugspunkt (Pin), der Freiradius wird live als Kreis gezeichnet.
// Leaflet + OpenStreetMap-Tiles (kein API-Key); Adresssuche und
// Reverse-Geocoding via Nominatim (öffentliche OSM-Instanz, sparsam genutzt:
// Suche nur auf Enter/Klick, Reverse nur pro Pin-Klick).
// Leaflet braucht `window` – die Komponente wird via next/dynamic
// (ssr: false) geladen, daher hier KEIN SSR-Schutz noetig.

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface PinPosition {
  lat: number;
  lng: number;
}

interface LocationPickerProps {
  value: PinPosition | null;
  radiusKm: number;
  onPick: (pos: PinPosition) => void;
  // Vorschlag fuer den Ortsnamen (aus Reverse-Geocoding bzw. Suchtreffer).
  onLocationName: (name: string) => void;
}

// Bern Bahnhof als Start-Ausschnitt (Sandros Region).
const DEFAULT_CENTER: L.LatLngTuple = [46.9489, 7.4398];
const DEFAULT_ZOOM = 9;

const PIN_ICON = L.divIcon({
  className: 'locpick-pin',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

interface NominatimHit {
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  address?: Record<string, string>;
}

// Kompakter Ortsname aus einer Nominatim-Antwort: «Treffpunkt, Ort».
function kurzname(hit: NominatimHit): string {
  const a = hit.address ?? {};
  const ort = a.city ?? a.town ?? a.village ?? a.municipality ?? '';
  const punkt = hit.name || a.road || '';
  if (punkt && ort && punkt !== ort) return `${punkt}, ${ort}`;
  return punkt || ort || hit.display_name.split(',').slice(0, 2).join(',');
}

async function nominatim(pfad: string): Promise<unknown> {
  const res = await fetch(`https://nominatim.openstreetmap.org/${pfad}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  return res.json();
}

export default function LocationPicker({
  value,
  radiusKm,
  onPick,
  onLocationName,
}: LocationPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);

  // Callbacks in Refs halten, damit die Karte nicht neu initialisiert wird.
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const onLocationNameRef = useRef(onLocationName);
  onLocationNameRef.current = onLocationName;

  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<NominatimHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Karte einmalig aufbauen.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;

    const map = L.map(el, { zoomSnap: 0.5 }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      const pos = { lat: e.latlng.lat, lng: e.latlng.lng };
      onPickRef.current(pos);
      // Ortsname zum Pin nachschlagen (best effort – Fehler still ignorieren).
      void nominatim(
        `reverse?format=jsonv2&accept-language=de&zoom=16&lat=${pos.lat}&lon=${pos.lng}`,
      )
        .then((json) => {
          const hit = json as NominatimHit;
          const name = kurzname(hit);
          if (name) onLocationNameRef.current(name);
        })
        .catch(() => undefined);
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
  }, []);

  // Pin + Radius-Kreis mit dem Formularzustand synchron halten.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!value) {
      markerRef.current?.remove();
      markerRef.current = null;
      circleRef.current?.remove();
      circleRef.current = null;
      return;
    }

    if (!markerRef.current) {
      markerRef.current = L.marker(value, { icon: PIN_ICON }).addTo(map);
    } else {
      markerRef.current.setLatLng(value);
    }

    const radiusM = Math.max(radiusKm, 0) * 1000;
    if (!circleRef.current) {
      circleRef.current = L.circle(value, {
        radius: radiusM,
        color: '#f23636',
        weight: 2,
        fillColor: '#f23636',
        fillOpacity: 0.08,
      }).addTo(map);
    } else {
      circleRef.current.setLatLng(value);
      circleRef.current.setRadius(radiusM);
    }

    // Ausschnitt so waehlen, dass der ganze Freiradius sichtbar ist –
    // aber nur, wenn der Kreis aus dem aktuellen Bild laeuft (sonst nicht
    // bei jedem Klick herumzoomen).
    if (radiusM > 0) {
      const bounds = circleRef.current.getBounds();
      if (!map.getBounds().contains(bounds)) {
        map.fitBounds(bounds, { padding: [24, 24] });
      }
    }
  }, [value, radiusKm]);

  async function suchen() {
    const q = query.trim();
    if (q.length < 2) return;
    setSearching(true);
    setSearchError(null);
    try {
      const json = await nominatim(
        `search?format=jsonv2&limit=5&countrycodes=ch&accept-language=de&addressdetails=1&q=${encodeURIComponent(q)}`,
      );
      const results = json as NominatimHit[];
      setHits(results);
      if (results.length === 0) setSearchError('Nichts gefunden – anders formulieren oder direkt auf die Karte klicken.');
    } catch {
      setSearchError('Suche nicht erreichbar – bitte direkt auf die Karte klicken.');
    } finally {
      setSearching(false);
    }
  }

  function uebernehmen(hit: NominatimHit) {
    const pos = { lat: Number(hit.lat), lng: Number(hit.lon) };
    setHits([]);
    setQuery('');
    onPick(pos);
    onLocationName(kurzname(hit));
    mapRef.current?.setView(pos, 13);
  }

  return (
    <div className="locpick">
      <div className="locpick-search">
        <input
          type="text"
          value={query}
          placeholder="Ort suchen, z. B. Bern Bahnhof"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void suchen();
            }
          }}
        />
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => void suchen()}
          disabled={searching}
        >
          {searching ? 'Sucht…' : 'Suchen'}
        </button>
      </div>
      {hits.length > 0 ? (
        <ul className="locpick-hits">
          {hits.map((h, i) => (
            <li key={i}>
              <button type="button" onClick={() => uebernehmen(h)}>
                {h.display_name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {searchError ? (
        <small className="mut" role="status">{searchError}</small>
      ) : null}
      <div ref={containerRef} className="locpick-map" />
      <small className="mut">
        Klick auf die Karte setzt den Standort, der Kreis zeigt den Freiradius.
      </small>
    </div>
  );
}
