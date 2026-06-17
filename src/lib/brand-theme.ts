// Brand theme utilities — translate a brand hex/HSL into the runtime CSS variables
// used across the app (primary, ring, sidebar, charts, etc.).

export type Hsl = { h: number; s: number; l: number };

// ---------- conversions ----------
export function hexToHsl(hex: string): Hsl | null {
  const m = hex.trim().replace("#", "");
  if (!/^([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(m)) return null;
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function hslToHex({ h, s, l }: Hsl): string {
  const sd = s / 100;
  const ld = l / 100;
  const c = (1 - Math.abs(2 * ld - 1)) * sd;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ld - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function hslString(hsl: Hsl): string {
  return `${hsl.h} ${hsl.s}% ${hsl.l}%`;
}

export function parseHslString(s: string | null | undefined): Hsl | null {
  if (!s) return null;
  const m = s.trim().match(/^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/);
  if (!m) return null;
  return { h: parseFloat(m[1]), s: parseFloat(m[2]), l: parseFloat(m[3]) };
}

// ---------- applying ----------
const PRIMARY_VARS = [
  "--primary",
  "--ring",
  "--brand",
  "--sidebar-primary",
  "--sidebar-ring",
  "--chart-1",
];
const ACCENT_VARS = ["--accent2", "--chart-3"];

// Pick a readable foreground for a primary color (white on dark, near-black on light).
function readableForeground(hsl: Hsl): string {
  return hsl.l > 62 ? "220 25% 10%" : "0 0% 100%";
}

export function applyBrandTheme(primary: string | null, accent: string | null) {
  const root = document.documentElement;
  const p = parseHslString(primary);
  const a = parseHslString(accent);
  if (p) {
    const v = hslString(p);
    PRIMARY_VARS.forEach((k) => root.style.setProperty(k, v));
    root.style.setProperty("--primary-foreground", readableForeground(p));
    root.style.setProperty("--brand-foreground", readableForeground(p));
    root.style.setProperty("--sidebar-primary-foreground", readableForeground(p));
  } else {
    PRIMARY_VARS.forEach((k) => root.style.removeProperty(k));
    root.style.removeProperty("--primary-foreground");
    root.style.removeProperty("--brand-foreground");
    root.style.removeProperty("--sidebar-primary-foreground");
  }
  if (a) {
    const v = hslString(a);
    ACCENT_VARS.forEach((k) => root.style.setProperty(k, v));
  } else {
    ACCENT_VARS.forEach((k) => root.style.removeProperty(k));
  }
}

export function clearBrandTheme() {
  applyBrandTheme(null, null);
}
