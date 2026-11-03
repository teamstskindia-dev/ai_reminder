import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
/** HTTPS-only directives (HSTS, upgrade-insecure-requests) are emitted only for an https production site. */
const isHttpsSite = !isDev && (process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https://");

/** API origin (+ its WebSocket origin) allowed in `connect-src` for fetch and Socket.IO. */
function apiOrigins(): string[] {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000");
    const ws = `${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}`;
    return [url.origin, ws];
  } catch {
    return [];
  }
}

/**
 * Content-Security-Policy.
 *
 * Compromise (documented in README): scripts allow 'unsafe-inline' because Next's inline hydration
 * scripts and next-themes' anti-flash script need it, and nonce-based CSP would force every page to
 * render dynamically, disabling the static / Partial Prerendering output this app relies on.
 * 'unsafe-eval' is only allowed in development (React refresh). Everything else is locked down.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  `img-src 'self' https: data: blob:${isDev ? " http:" : ""}`,
  "font-src 'self' https://fonts.gstatic.com data:",
  `connect-src 'self' ${apiOrigins().join(" ")}${isDev ? " ws: http://localhost:*" : ""}`,
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  ...(isHttpsSite ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isHttpsSite ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : []),
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
