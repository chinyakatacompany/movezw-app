import React, { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Loader2, MapPin, MapPinned, Sparkles } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
// Lazy so maplibre-gl only loads for the rare case this fallback is opened,
// not on every page that renders an address input.
const PinDropMap = React.lazy(() => import("@/components/PinDropMap"));

// Free public Nominatim geocoder (OpenStreetMap) — no API key, no paid tier,
// same "free, open technology" pattern as OSRM/OpenFreeMap elsewhere in this
// app. Its usage policy disallows firing a request on every keystroke, so we
// debounce until the user pauses rather than searching live.
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const DEBOUNCE_MS = 600;
const MIN_CHARS = 3;
// Rough Zimbabwe bounding box (left,top,right,bottom) to bias/rank results —
// countrycodes is the hard filter, this just improves local ranking.
const ZW_VIEWBOX = "25.0,-15.5,33.1,-22.5";

export default function AddressSearchInput({
  id,
  icon: Icon = MapPin,
  iconClassName = "text-muted-foreground",
  value,
  onChange,
  onSelect,
  placeholder,
  required,
}) {
  const [results, setResults] = useState([]);
  const [knownResults, setKnownResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [showPinDrop, setShowPinDrop] = useState(false);
  const containerRef = useRef(null);
  const debounceRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => () => {
    clearTimeout(debounceRef.current);
    abortRef.current?.abort();
  }, []);

  const runSearch = async (text, isRetry = false) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        format: "json",
        q: text,
        countrycodes: "zw",
        viewbox: ZW_VIEWBOX,
        limit: "5",
        addressdetails: "1",
      });
      const res = await fetch(`${NOMINATIM_URL}?${params.toString()}`, { signal: controller.signal });
      if (!res.ok) throw new Error(`Nominatim ${res.status}`);
      const data = await res.json();
      const found = Array.isArray(data) ? data : [];
      setResults(found);
      setSearched(true);
      setOpen(true);
      // Nominatim found nothing — check places a driver has actually
      // reached before via Google Maps for the same text (see
      // fn_learn_place in DriverJobDetail.jsx) before falling back to the
      // "no results" / pin-drop state.
      if (found.length === 0) {
        const { data: known, error: knownErr } = await supabase
          .from("known_places")
          .select("*")
          .ilike("label", `%${text.toLowerCase()}%`)
          .order("hit_count", { ascending: false })
          .limit(3);
        if (knownErr) console.error("Failed to check known places:", knownErr);
        setKnownResults(known || []);
      } else {
        setKnownResults([]);
      }
    } catch (err) {
      if (err.name === "AbortError") return;
      // Nominatim is a free, best-effort service — a transient hiccup or
      // rate-limit response shouldn't read as "no results exist", so retry
      // once before showing the empty state.
      if (!isRetry) {
        setTimeout(() => runSearch(text, true), 800);
        return;
      }
      setResults([]);
      setSearched(true);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  const handleChange = (e) => {
    const text = e.target.value;
    onChange?.(text);
    setSearched(false);
    clearTimeout(debounceRef.current);
    if (text.trim().length < MIN_CHARS) {
      setResults([]);
      setKnownResults([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => runSearch(text.trim()), DEBOUNCE_MS);
  };

  const pick = (r) => {
    onChange?.(r.display_name);
    onSelect?.({ lat: parseFloat(r.lat), lng: parseFloat(r.lon), label: r.display_name });
    setResults([]);
    setOpen(false);
  };

  const pickKnown = (k) => {
    onChange?.(k.display_name);
    onSelect?.({ lat: Number(k.lat), lng: Number(k.lng), label: k.display_name });
    setKnownResults([]);
    setOpen(false);
  };

  const pickPin = ({ lat, lng, label }) => {
    onChange?.(label);
    onSelect?.({ lat, lng, label });
    setShowPinDrop(false);
    setResults([]);
    setOpen(false);
  };

  return (
    <div className="relative" ref={containerRef}>
      <Icon className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none ${iconClassName}`} />
      {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
      <Input
        id={id}
        value={value}
        onChange={handleChange}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={placeholder}
        className="pl-10 pr-9"
        autoComplete="off"
        required={required}
      />
      {open && (results.length > 0 || (searched && !loading)) && (
        <ul className="absolute z-20 mt-1.5 w-full bg-card border border-border rounded-xl shadow-lg overflow-hidden max-h-64 overflow-y-auto">
          {results.length > 0 ? (
            results.map((r) => (
              <li key={r.place_id}>
                <button
                  type="button"
                  onClick={() => pick(r)}
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted/60 flex items-start gap-2 border-b border-border last:border-0"
                >
                  <MapPin className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                  <span className="line-clamp-2">{r.display_name}</span>
                </button>
              </li>
            ))
          ) : knownResults.length > 0 ? (
            knownResults.map((k) => (
              <li key={k.id}>
                <button
                  type="button"
                  onClick={() => pickKnown(k)}
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted/60 flex items-start gap-2 border-b border-border last:border-0"
                >
                  <Sparkles className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="line-clamp-2 block">{k.display_name}</span>
                    <span className="text-[11px] text-muted-foreground">Learned from a previous delivery</span>
                  </span>
                </button>
              </li>
            ))
          ) : (
            <li className="p-3 space-y-2">
              <p className="text-sm text-muted-foreground">No matching addresses found — this address search doesn't cover every local business or informal place name.</p>
              <button
                type="button"
                onClick={() => setShowPinDrop(true)}
                className="w-full flex items-center justify-center gap-2 h-10 rounded-lg bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/15 transition-colors"
              >
                <MapPinned className="w-4 h-4" /> Pick location on map instead
              </button>
            </li>
          )}
        </ul>
      )}
      {showPinDrop && (
        <React.Suspense fallback={null}>
          <PinDropMap onConfirm={pickPin} onClose={() => setShowPinDrop(false)} />
        </React.Suspense>
      )}
    </div>
  );
}
