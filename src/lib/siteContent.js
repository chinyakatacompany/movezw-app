import { useEffect, useState } from "react";
import { supabase } from "@/api/supabaseClient";

// Public, admin-editable text used across the landing page and legal pages.
// Falls back to the string passed at each call site until an admin
// customizes it via /admin/content, so the site reads correctly with an
// empty site_content table.
export function useSiteContent() {
  const [content, setContent] = useState({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    supabase
      .from("site_content")
      .select("key, value")
      .then(({ data, error }) => {
        if (error) console.error("Failed to load site content:", error);
        if (!active) return;
        setContent(Object.fromEntries((data || []).map((r) => [r.key, r.value])));
        setLoaded(true);
      });
    return () => { active = false; };
  }, []);

  const t = (key, fallback) => content[key] ?? fallback;
  return { t, loaded };
}
