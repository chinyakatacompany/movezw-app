import React, { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Loader2, MapPin } from "lucide-react";

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
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
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

  const runSearch = async (text) => {
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
      const data = await res.json();
      setResults(Array.isArray(data) ? data : []);
      setSearched(true);
      setOpen(true);
    } catch (err) {
      if (err.name !== "AbortError") { setResults([]); setSearched(true); }
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
        <ul className="absolute z-20 mt-1.5 w-full bg-white border border-border rounded-xl shadow-lg overflow-hidden max-h-64 overflow-y-auto">
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
          ) : (
            <li className="px-3 py-2.5 text-sm text-muted-foreground">No matching addresses found — you can still type it manually.</li>
          )}
        </ul>
      )}
    </div>
  );
}
