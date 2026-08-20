// App-wide color themes, selectable by an admin (see AdminContent.jsx) and
// applied globally via ThemeLoader.jsx. Each theme re-specifies the same
// HSL custom properties index.css defines on :root.
export const THEME_VARS = [
  "background", "foreground", "card", "card-foreground", "popover", "popover-foreground",
  "primary", "primary-foreground", "secondary", "secondary-foreground", "muted", "muted-foreground",
  "accent", "accent-foreground", "destructive", "destructive-foreground", "border", "input", "ring",
  "header", "header-foreground",
];

export const DEFAULT_THEME = "movezw";

export const THEMES = {
  movezw: {
    label: "MoveZW",
    swatch: ["22 92% 42%", "223 51% 25%", "225 50% 10%"],
    vars: {
      background: "214 35% 96%", foreground: "223 51% 18%",
      card: "0 0% 100%", "card-foreground": "223 51% 18%",
      popover: "0 0% 100%", "popover-foreground": "223 51% 18%",
      primary: "22 92% 42%", "primary-foreground": "0 0% 100%",
      secondary: "220 35% 94%", "secondary-foreground": "223 51% 25%",
      muted: "220 30% 93%", "muted-foreground": "220 15% 43%",
      accent: "28 96% 40%", "accent-foreground": "0 0% 100%",
      destructive: "0 72% 45%", "destructive-foreground": "0 0% 100%",
      border: "220 25% 84%", input: "220 25% 90%", ring: "22 92% 42%",
      header: "223 51% 25%", "header-foreground": "0 0% 100%",
      headerGradient: "linear-gradient(135deg, hsl(223 51% 25%) 0%, hsl(225 50% 18%) 65%, hsl(22 92% 42%) 100%)",
    },
  },
  movezwDark: {
    label: "MoveZW Dark",
    swatch: ["14 88% 44%", "223 51% 25%", "225 45% 14%"],
    // Dark navy page chrome, navy-blue content cards with soft white
    // (not pure white) text and an orange stroke — background/header/card
    // all share the same dark-blue family, orange carries the brand accent.
    vars: {
      background: "225 42% 11%", foreground: "0 0% 98%",
      card: "224 38% 15%", "card-foreground": "0 0% 92%",
      popover: "224 38% 15%", "popover-foreground": "0 0% 92%",
      primary: "14 88% 44%", "primary-foreground": "0 0% 100%",
      secondary: "224 32% 19%", "secondary-foreground": "0 0% 95%",
      muted: "224 32% 19%", "muted-foreground": "220 15% 68%",
      accent: "18 90% 40%", "accent-foreground": "0 0% 100%",
      destructive: "0 72% 50%", "destructive-foreground": "0 0% 100%",
      border: "16 85% 48%", input: "224 28% 20%", ring: "14 88% 44%",
      header: "225 45% 14%", "header-foreground": "0 0% 98%",
    },
  },
  classic: {
    label: "Classic Terracotta",
    swatch: ["20 65% 33%", "22 92% 24%", "220 55% 15%"],
    vars: {
      background: "214 18% 72%", foreground: "222 46% 38%",
      card: "210 20% 98%", "card-foreground": "222 47% 11%",
      popover: "0 0% 100%", "popover-foreground": "222 47% 11%",
      primary: "20 65% 33%", "primary-foreground": "0 0% 100%",
      secondary: "210 20% 96%", "secondary-foreground": "222 55% 19%",
      muted: "210 30% 94%", "muted-foreground": "215 16% 42%",
      accent: "22 92% 24%", "accent-foreground": "0 0% 100%",
      destructive: "0 72% 45%", "destructive-foreground": "0 0% 100%",
      border: "214 31% 21%", input: "214 32% 91%", ring: "224 76% 26%",
      header: "220 55% 15%", "header-foreground": "0 0% 100%",
    },
  },
  spectrum: {
    label: "Spectrum",
    swatch: ["330 75% 50%", "45 90% 50%", "265 60% 35%"],
    swatchGradient: "linear-gradient(135deg, hsl(330 75% 55%), hsl(265 70% 45%), hsl(200 80% 50%), hsl(45 90% 55%))",
    vars: {
      background: "260 30% 92%", foreground: "260 25% 20%",
      card: "0 0% 98%", "card-foreground": "260 30% 14%",
      popover: "0 0% 100%", "popover-foreground": "260 30% 14%",
      primary: "330 75% 50%", "primary-foreground": "0 0% 100%",
      secondary: "260 20% 96%", "secondary-foreground": "260 25% 20%",
      muted: "260 20% 92%", "muted-foreground": "260 12% 45%",
      accent: "45 90% 50%", "accent-foreground": "260 30% 14%",
      destructive: "0 72% 45%", "destructive-foreground": "0 0% 100%",
      border: "260 25% 25%", input: "260 20% 90%", ring: "330 70% 45%",
      header: "265 60% 35%", "header-foreground": "0 0% 100%",
      headerGradient: "linear-gradient(135deg, hsl(330 75% 55%) 0%, hsl(265 70% 45%) 45%, hsl(200 80% 50%) 75%, hsl(45 90% 55%) 100%)",
    },
  },
  ocean: {
    label: "Ocean Blue",
    swatch: ["199 75% 32%", "187 85% 28%", "205 60% 14%"],
    vars: {
      background: "205 30% 74%", foreground: "210 50% 20%",
      card: "200 20% 98%", "card-foreground": "210 47% 11%",
      popover: "0 0% 100%", "popover-foreground": "210 47% 11%",
      primary: "199 75% 32%", "primary-foreground": "0 0% 100%",
      secondary: "200 20% 96%", "secondary-foreground": "210 55% 19%",
      muted: "200 30% 94%", "muted-foreground": "205 16% 42%",
      accent: "187 85% 28%", "accent-foreground": "0 0% 100%",
      destructive: "0 72% 45%", "destructive-foreground": "0 0% 100%",
      border: "205 35% 22%", input: "205 32% 91%", ring: "205 76% 30%",
      header: "205 60% 14%", "header-foreground": "0 0% 100%",
    },
  },
  forest: {
    label: "Forest Green",
    swatch: ["142 55% 28%", "88 55% 30%", "140 45% 14%"],
    vars: {
      background: "130 18% 72%", foreground: "140 46% 22%",
      card: "120 20% 98%", "card-foreground": "140 47% 11%",
      popover: "0 0% 100%", "popover-foreground": "140 47% 11%",
      primary: "142 55% 28%", "primary-foreground": "0 0% 100%",
      secondary: "120 20% 96%", "secondary-foreground": "140 55% 19%",
      muted: "120 25% 94%", "muted-foreground": "130 16% 38%",
      accent: "88 55% 30%", "accent-foreground": "0 0% 100%",
      destructive: "0 72% 45%", "destructive-foreground": "0 0% 100%",
      border: "140 31% 20%", input: "130 25% 91%", ring: "142 55% 26%",
      header: "140 45% 14%", "header-foreground": "0 0% 100%",
    },
  },
  royal: {
    label: "Royal Purple",
    swatch: ["262 55% 38%", "292 60% 32%", "262 45% 16%"],
    vars: {
      background: "262 20% 76%", foreground: "262 40% 30%",
      card: "260 25% 98%", "card-foreground": "262 47% 13%",
      popover: "0 0% 100%", "popover-foreground": "262 47% 13%",
      primary: "262 55% 38%", "primary-foreground": "0 0% 100%",
      secondary: "260 25% 96%", "secondary-foreground": "262 50% 22%",
      muted: "260 25% 94%", "muted-foreground": "262 16% 44%",
      accent: "292 60% 32%", "accent-foreground": "0 0% 100%",
      destructive: "0 72% 45%", "destructive-foreground": "0 0% 100%",
      border: "262 31% 22%", input: "260 25% 91%", ring: "262 60% 32%",
      header: "262 45% 16%", "header-foreground": "0 0% 100%",
    },
  },
  sunset: {
    label: "Sunset",
    swatch: ["14 75% 40%", "350 65% 38%", "14 55% 15%"],
    vars: {
      background: "24 30% 76%", foreground: "14 55% 26%",
      card: "30 25% 98%", "card-foreground": "14 47% 12%",
      popover: "0 0% 100%", "popover-foreground": "14 47% 12%",
      primary: "14 75% 40%", "primary-foreground": "0 0% 100%",
      secondary: "30 25% 96%", "secondary-foreground": "14 55% 20%",
      muted: "30 25% 94%", "muted-foreground": "20 18% 42%",
      accent: "350 65% 38%", "accent-foreground": "0 0% 100%",
      destructive: "0 72% 45%", "destructive-foreground": "0 0% 100%",
      border: "14 35% 22%", input: "24 30% 91%", ring: "14 65% 32%",
      header: "14 55% 15%", "header-foreground": "0 0% 100%",
    },
  },
  crimson: {
    label: "Crimson",
    swatch: ["350 70% 38%", "8 75% 40%", "350 55% 15%"],
    vars: {
      background: "355 30% 76%", foreground: "350 55% 26%",
      card: "350 25% 98%", "card-foreground": "350 47% 12%",
      popover: "0 0% 100%", "popover-foreground": "350 47% 12%",
      primary: "350 70% 38%", "primary-foreground": "0 0% 100%",
      secondary: "350 25% 96%", "secondary-foreground": "350 55% 20%",
      muted: "350 25% 94%", "muted-foreground": "350 16% 42%",
      accent: "8 75% 40%", "accent-foreground": "0 0% 100%",
      destructive: "0 72% 45%", "destructive-foreground": "0 0% 100%",
      border: "350 35% 22%", input: "350 30% 91%", ring: "350 65% 32%",
      header: "350 55% 15%", "header-foreground": "0 0% 100%",
    },
  },
  amber: {
    label: "Golden Amber",
    swatch: ["36 80% 38%", "20 75% 36%", "34 55% 15%"],
    vars: {
      background: "42 35% 74%", foreground: "34 55% 24%",
      card: "42 30% 98%", "card-foreground": "34 47% 12%",
      popover: "0 0% 100%", "popover-foreground": "34 47% 12%",
      primary: "36 80% 38%", "primary-foreground": "0 0% 100%",
      secondary: "42 30% 96%", "secondary-foreground": "34 55% 20%",
      muted: "42 30% 94%", "muted-foreground": "36 18% 40%",
      accent: "20 75% 36%", "accent-foreground": "0 0% 100%",
      destructive: "0 72% 45%", "destructive-foreground": "0 0% 100%",
      border: "34 35% 22%", input: "42 30% 91%", ring: "36 70% 32%",
      header: "34 55% 15%", "header-foreground": "0 0% 100%",
    },
  },
  teal: {
    label: "Teal",
    swatch: ["175 65% 26%", "165 70% 26%", "180 45% 13%"],
    vars: {
      background: "178 25% 72%", foreground: "180 45% 20%",
      card: "175 20% 98%", "card-foreground": "180 47% 11%",
      popover: "0 0% 100%", "popover-foreground": "180 47% 11%",
      primary: "175 65% 26%", "primary-foreground": "0 0% 100%",
      secondary: "175 20% 96%", "secondary-foreground": "180 50% 18%",
      muted: "175 25% 94%", "muted-foreground": "178 16% 40%",
      accent: "165 70% 26%", "accent-foreground": "0 0% 100%",
      destructive: "0 72% 45%", "destructive-foreground": "0 0% 100%",
      border: "180 31% 20%", input: "175 25% 91%", ring: "175 60% 26%",
      header: "180 45% 13%", "header-foreground": "0 0% 100%",
    },
  },
  slate: {
    label: "Slate",
    swatch: ["220 30% 32%", "205 40% 34%", "220 25% 15%"],
    vars: {
      background: "220 12% 74%", foreground: "220 25% 26%",
      card: "220 15% 98%", "card-foreground": "220 30% 13%",
      popover: "0 0% 100%", "popover-foreground": "220 30% 13%",
      primary: "220 30% 32%", "primary-foreground": "0 0% 100%",
      secondary: "220 15% 96%", "secondary-foreground": "220 30% 20%",
      muted: "220 15% 94%", "muted-foreground": "220 10% 42%",
      accent: "205 40% 34%", "accent-foreground": "0 0% 100%",
      destructive: "0 72% 45%", "destructive-foreground": "0 0% 100%",
      border: "220 20% 22%", input: "220 15% 91%", ring: "220 35% 30%",
      header: "220 25% 15%", "header-foreground": "0 0% 100%",
    },
  },
  nightfall: {
    label: "Nightfall Gold",
    swatch: ["40 70% 42%", "190 35% 30%", "200 30% 13%"],
    vars: {
      background: "200 18% 89%", foreground: "205 30% 20%",
      card: "195 15% 98%", "card-foreground": "205 35% 13%",
      popover: "0 0% 100%", "popover-foreground": "205 35% 13%",
      primary: "40 70% 42%", "primary-foreground": "0 0% 100%",
      secondary: "195 15% 96%", "secondary-foreground": "205 30% 20%",
      muted: "195 15% 92%", "muted-foreground": "200 12% 42%",
      accent: "190 35% 30%", "accent-foreground": "0 0% 100%",
      destructive: "0 72% 45%", "destructive-foreground": "0 0% 100%",
      border: "205 30% 18%", input: "195 15% 88%", ring: "40 65% 38%",
      header: "200 30% 13%", "header-foreground": "40 75% 62%",
    },
  },
  glass: {
    label: "Aurora Glass",
    swatch: ["262 70% 55%", "200 80% 52%", "255 45% 22%"],
    // A "bit of transparency" theme — card/popover/header carry an alpha
    // channel baked directly into the stored HSL value (hsl(var(--card))
    // expands to a valid 4-part hsl(H S% L% / A)). It reads most clearly on
    // surfaces that already pair a token with backdrop-blur in the markup
    // (the bottom nav, the scrolled landing/auth headers) — the plain top
    // app header has no blur behind it, so its translucency is subtler.
    vars: {
      background: "250 35% 90%", foreground: "250 25% 20%",
      card: "250 40% 98% / 0.9", "card-foreground": "250 30% 14%",
      popover: "250 40% 98% / 0.92", "popover-foreground": "250 30% 14%",
      primary: "262 70% 55%", "primary-foreground": "0 0% 100%",
      secondary: "250 30% 95%", "secondary-foreground": "250 25% 20%",
      muted: "250 25% 92%", "muted-foreground": "250 15% 45%",
      accent: "200 80% 52%", "accent-foreground": "0 0% 100%",
      destructive: "0 72% 45%", "destructive-foreground": "0 0% 100%",
      border: "250 25% 55% / 0.3", input: "250 25% 90%", ring: "262 65% 50%",
      header: "255 45% 22% / 0.82", "header-foreground": "0 0% 100%",
    },
  },
  midnight: {
    label: "Midnight Cyan",
    swatch: ["174 65% 38%", "165 70% 34%", "200 25% 9%"],
    // Cards throughout the app are mostly hand-styled with a literal
    // bg-white rather than the bg-card token, so — unlike the other themes
    // — making --card dark here wouldn't actually reach most surfaces and
    // would risk dark-on-dark text wherever it did. Keeps the same light
    // background / near-white card structure every other theme uses, and
    // carries the "glowing cyan on near-black" digital-display look on the
    // one element that's genuinely dark in every theme already: the header.
    vars: {
      background: "195 15% 88%", foreground: "200 30% 18%",
      card: "195 10% 98%", "card-foreground": "200 30% 12%",
      popover: "0 0% 100%", "popover-foreground": "200 30% 12%",
      primary: "174 65% 38%", "primary-foreground": "0 0% 100%",
      secondary: "195 15% 96%", "secondary-foreground": "200 30% 20%",
      muted: "195 15% 92%", "muted-foreground": "195 12% 42%",
      accent: "165 70% 34%", "accent-foreground": "0 0% 100%",
      destructive: "0 72% 45%", "destructive-foreground": "0 0% 100%",
      border: "200 30% 20%", input: "195 15% 89%", ring: "174 60% 34%",
      header: "200 25% 9%", "header-foreground": "174 75% 58%",
    },
  },
};

// Cache key read by the inline bootstrap script in index.html — keep the
// two in sync if this ever changes.
export const THEME_CACHE_KEY = "movzw_theme_vars";

// A signed-in user's personal light/dark choice (Profile page), which beats
// the admin's site-wide default (site_content "site.theme") once set — see
// ThemeLoader.jsx for the full precedence order. Only ever "movezw" (light)
// or "movezwDark"; the rest of the THEMES catalog stays admin-only branding.
export const THEME_USER_OVERRIDE_KEY = "movzw_theme_override";

export function getUserThemeOverride() {
  try {
    return localStorage.getItem(THEME_USER_OVERRIDE_KEY);
  } catch {
    return null;
  }
}

export function setUserThemeOverride(key) {
  try {
    localStorage.setItem(THEME_USER_OVERRIDE_KEY, key);
  } catch {}
  applyTheme(key);
}

// Sets the inline :root overrides for every theme variable, and stashes the
// resolved values in localStorage so index.html's inline bootstrap script
// can re-apply them synchronously before the app mounts on the next load —
// otherwise every page load repaints once from index.css's baseline colors
// to the real theme the moment this module's Supabase fetch (see
// ThemeLoader.jsx) resolves, which is the flash-of-wrong-theme this exists
// to avoid.
export function applyTheme(key) {
  const theme = THEMES[key] || THEMES[DEFAULT_THEME];
  const root = document.documentElement;
  const resolved = {};
  THEME_VARS.forEach((name) => {
    const value = theme.vars?.[name];
    if (value) {
      root.style.setProperty(`--${name}`, value);
      resolved[name] = value;
    } else {
      root.style.removeProperty(`--${name}`);
    }
  });
  // Not a color token — a full background-image value, only set by themes
  // that opt into a gradient header (see the .bg-header rule in index.css).
  if (theme.vars?.headerGradient) {
    root.style.setProperty("--header-gradient", theme.vars.headerGradient);
    resolved["header-gradient"] = theme.vars.headerGradient;
  } else {
    root.style.removeProperty("--header-gradient");
  }
  try {
    localStorage.setItem(THEME_CACHE_KEY, JSON.stringify(resolved));
  } catch {}
}
