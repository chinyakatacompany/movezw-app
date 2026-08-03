import * as maplibregl from "maplibre-gl";

// MapLibre GL JS's worker script (maplibre-gl-worker.mjs) itself imports a
// sibling chunk, maplibre-gl-shared.mjs, via a relative "./maplibre-gl-
// shared.mjs" specifier — it needs a file with that *exact* unhashed name
// sitting next to it. Vite's normal asset pipeline (`?url` imports,
// optimizeDeps, etc.) content-hashes filenames, which breaks that relative
// import in the production build (the worker fetches fine, then dies
// immediately trying to resolve its own dependency — no thrown error, the
// map's `load` event just never fires). Serving both files verbatim from
// public/ sidesteps hashing entirely, so the relative import resolves
// exactly like it does inside the npm package.
maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
