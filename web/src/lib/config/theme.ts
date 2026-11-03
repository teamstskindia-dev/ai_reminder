import type { Theme } from "@/lib/api/types";
import { normalizeTheme } from "./normalize";

/**
 * Turns the admin-controlled `theme` into CSS custom properties that drive every Tailwind /
 * shadcn token (see globals.css). Values are sanitised by `normalizeTheme` before being inlined.
 *
 * `html:root` / `html.dark` out-rank the defaults in globals.css regardless of stylesheet order.
 */
export function themeToCss(input: Theme): string {
  const t = normalizeTheme(input);
  const p = t.primaryColor;
  const sb = t.sidebarBackground;
  const sf = t.sidebarForeground;
  const font = `"${t.fontFamily}"`;

  const shared = [
    `--brand:${p}`,
    `--brand-foreground:${t.primaryForeground}`,
    `--brand-accent:${t.accentColor}`,
    `--primary:${p}`,
    `--primary-foreground:${t.primaryForeground}`,
    `--radius:${t.radius}px`,
    `--app-font:${font}`,
    `--sidebar:${sb}`,
    `--sidebar-foreground:${sf}`,
    `--sidebar-primary:${p}`,
    `--sidebar-primary-foreground:${t.primaryForeground}`,
    `--sidebar-accent:color-mix(in oklab, ${sf} 10%, ${sb})`,
    `--sidebar-accent-foreground:${sf}`,
    `--sidebar-border:color-mix(in oklab, ${sf} 12%, ${sb})`,
    `--sidebar-ring:color-mix(in oklab, ${p} 60%, transparent)`,
    // Chart palette derived from the brand: primary, accent, then tints/shades of both.
    `--chart-1:${p}`,
    `--chart-2:${t.accentColor}`,
    `--chart-3:color-mix(in oklab, ${p} 55%, #f59e0b)`,
    `--chart-4:color-mix(in oklab, ${t.accentColor} 45%, #0ea5e9)`,
    `--chart-5:color-mix(in oklab, ${p} 40%, #ec4899)`,
  ];

  const light = [
    `--ring:color-mix(in oklab, ${p} 55%, transparent)`,
    `--accent:color-mix(in oklab, ${p} 8%, white)`,
    `--accent-foreground:color-mix(in oklab, ${p} 75%, black)`,
    `--brand-soft:color-mix(in oklab, ${p} 10%, white)`,
    `--brand-soft-foreground:color-mix(in oklab, ${p} 80%, black)`,
  ];

  const dark = [
    `--ring:color-mix(in oklab, ${p} 65%, transparent)`,
    `--accent:color-mix(in oklab, ${p} 22%, oklch(0.205 0 0))`,
    `--accent-foreground:oklch(0.985 0 0)`,
    `--brand-soft:color-mix(in oklab, ${p} 22%, oklch(0.2 0 0))`,
    `--brand-soft-foreground:color-mix(in oklab, ${p} 35%, white)`,
  ];

  return `html:root{${[...shared, ...light].join(";")}}html.dark{${dark.join(";")}}`;
}

/** Google Fonts stylesheet URLs for the configured (validated, URL-encoded) family: weighted request + plain fallback. */
export function googleFontUrls(fontFamily: string): string[] {
  const family = encodeURIComponent(normalizeTheme({ fontFamily }).fontFamily);
  return [
    `https://fonts.googleapis.com/css2?family=${family}:wght@400;500;600;700&display=swap`,
    `https://fonts.googleapis.com/css2?family=${family}&display=swap`,
  ];
}
