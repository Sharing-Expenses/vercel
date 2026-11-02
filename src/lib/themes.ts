// Color sets a group can use. The CSS variables for each live in globals.css under [data-theme="..."].
// "orange" is the original look and the default for groups created before colors existed.

export const THEMES = ["orange", "green", "blue", "purple", "pink", "teal", "red", "yellow"] as const;
export type ThemeName = (typeof THEMES)[number];

// Header and accent colors, used for the browser status bar and the dots in the group tabs.
export const THEME_COLORS: Record<ThemeName, { header: string; accent: string }> = {
  orange: { header: "#2f1d05", accent: "#f0922f" },
  green: { header: "#0f2a12", accent: "#58b45f" },
  blue: { header: "#0d2238", accent: "#3d95f0" },
  purple: { header: "#231238", accent: "#a070e8" },
  pink: { header: "#35132a", accent: "#ec6fb5" },
  teal: { header: "#0b2e2e", accent: "#35c2b6" },
  red: { header: "#35100f", accent: "#ef5b4f" },
  yellow: { header: "#2e2805", accent: "#e8c632" },
};

export function asTheme(value: string | null | undefined): ThemeName {
  return (THEMES as readonly string[]).includes(value ?? "") ? (value as ThemeName) : "orange";
}

/** Random theme for a new group, preferring colors none of the user's groups use yet. */
export function pickGroupColor(used: string[], rng: () => number = Math.random): ThemeName {
  const free = THEMES.filter((t) => !used.includes(t));
  const pool = free.length > 0 ? free : THEMES;
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}
