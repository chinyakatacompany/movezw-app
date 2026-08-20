import { useEffect } from "react";
import { supabase } from "@/api/supabaseClient";
import { applyTheme, DEFAULT_THEME, getUserThemeOverride } from "@/lib/theme";

// Applies the admin-selected app theme (site_content key "site.theme") as
// soon as the app boots, before any route renders — mounted once at the top
// of App.jsx so it covers the landing page and auth screens too, not just
// logged-in dashboards.
export default function ThemeLoader() {
  useEffect(() => {
    // Local-only override for previewing an unreleased theme before it's
    // set live in site_content (which is shared with production) — e.g.
    // http://localhost:5177/?previewTheme=movezwDark. Stashed in
    // sessionStorage so a full reload or a fresh tab (not just client-side
    // navigation) keeps previewing it for the rest of this browser session,
    // without writing anything to the shared site_content row.
    const urlPreviewTheme = new URLSearchParams(window.location.search).get("previewTheme");
    if (urlPreviewTheme) sessionStorage.setItem("movzw_preview_theme", urlPreviewTheme);
    const previewTheme = urlPreviewTheme || sessionStorage.getItem("movzw_preview_theme");
    if (previewTheme) {
      applyTheme(previewTheme);
      return;
    }
    // A user's own light/dark choice (Profile page) beats the admin's
    // site-wide default — set once, it sticks across visits/devices... this
    // browser, at least, since it's stored locally rather than on the
    // profile row.
    const userOverride = getUserThemeOverride();
    if (userOverride) {
      applyTheme(userOverride);
      return;
    }
    let active = true;
    supabase
      .from("site_content")
      .select("value")
      .eq("key", "site.theme")
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.error("Failed to load app theme:", error);
        if (active) applyTheme(data?.value || DEFAULT_THEME);
      });
    return () => { active = false; };
  }, []);

  return null;
}
