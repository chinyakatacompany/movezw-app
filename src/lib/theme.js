// App-wide color themes, selectable by an admin (see AdminContent.jsx) and
// applied globally via ThemeLoader.jsx. Each theme re-specifies the same
// HSL custom properties index.css defines on :root — "classic" has no vars
// because those defaults already match the current stylesheet, so selecting
// it just means "use the stylesheet as-is" rather than duplicating values.
export const THEME_VARS = [
  "background", "foreground", "card", "card-foreground", "popover", "popover-foreground",
  "primary", "primary-foreground", "secondary", "secondary-foreground", "muted", "muted-foreground",
  "accent", "accent-foreground", "destructive", "destructive-foreground", "border", "input", "ring",
  "header", "header-foreground",
];

export const DEFAULT_THEME = "classic";

export const THEMES = {
  classic: {
    label: "Classic Terracotta",
    swatch: ["20 65% 33%", "22 92% 24%", "220 55% 15%"],
    vars: null,
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

// Sets/clears the inline :root overrides for every theme variable. Passing
// "classic" (or an unknown key) clears all overrides so the stylesheet's
// own :root defaults show through — no duplicated "default theme" values
// to keep in sync.
export function applyTheme(key) {
  const theme = THEMES[key] || THEMES[DEFAULT_THEME];
  const root = document.documentElement;
  THEME_VARS.forEach((name) => {
    const value = theme.vars?.[name];
    if (value) root.style.setProperty(`--${name}`, value);
    else root.style.removeProperty(`--${name}`);
  });
}
