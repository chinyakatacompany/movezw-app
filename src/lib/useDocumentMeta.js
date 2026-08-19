import { useEffect } from "react";

const DEFAULT_TITLE = "MoveZW — Move Anything, Anywhere in Zimbabwe | Trusted Transport Marketplace";
const DEFAULT_DESCRIPTION = "Book verified drivers to move your cargo anywhere in Zimbabwe. Post a transport request, compare offers from local drivers, and track your delivery in real time. Free to join.";

// index.html's static tags only cover whoever's first paint actually hits
// the server for "/" — client-side navigation to another public route (no
// full page reload) leaves the tab title/description stuck on the
// homepage's, which is wrong for both real users (tab title, bookmarks,
// shares) and Google's JS-rendering crawler. Restores the defaults on
// unmount so navigating away doesn't leave a stale title behind.
export function useDocumentMeta(title, description) {
  useEffect(() => {
    document.title = title || DEFAULT_TITLE;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", description || DEFAULT_DESCRIPTION);
    return () => {
      document.title = DEFAULT_TITLE;
      if (meta) meta.setAttribute("content", DEFAULT_DESCRIPTION);
    };
  }, [title, description]);
}
