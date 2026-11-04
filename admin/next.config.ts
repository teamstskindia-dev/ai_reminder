import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV !== 'production';

/** Origin of the API (connect-src). Falls back to the dev default so builds never produce an empty CSP. */
function apiOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  try {
    return new URL(raw).origin;
  } catch {
    return 'http://localhost:4000';
  }
}

/**
 * Same-origin mode: NEXT_PUBLIC_API_PROXY=true makes the browser call /api/v1 on this domain, and this server forwards
 * it to API_PROXY_TARGET (server-only, e.g. https://api.example.com). Fails the build when misconfigured rather than
 * shipping an admin that cannot reach its API.
 */
const sameOrigin = process.env.NEXT_PUBLIC_API_PROXY === 'true';

function proxyTarget(): string | null {
  if (!sameOrigin) return null;
  const raw = process.env.API_PROXY_TARGET;
  let url: URL;
  try {
    url = new URL(raw ?? '');
  } catch {
    throw new Error('NEXT_PUBLIC_API_PROXY=true requires API_PROXY_TARGET, the backend origin (e.g. https://api.example.com)');
  }
  if (!isDev && url.protocol !== 'https:') {
    throw new Error('API_PROXY_TARGET must be an https:// origin in production builds');
  }
  return url.origin;
}

/**
 * HTTPS-only directives (HSTS, upgrade-insecure-requests) apply to production builds that talk to an https API.
 * A production build run locally against http://localhost keeps working (they would break plain-http requests).
 */
const httpsDeployment = !isDev && (sameOrigin || apiOrigin().startsWith('https://'));

/**
 * Content-Security-Policy without nonces. Nonces would force every page to render dynamically (no static
 * shells), so scripts allow 'unsafe-inline' for Next.js's inline bootstrap/flight data and next-themes'
 * no-flash script; 'unsafe-eval' only in development (React debugging). Everything else is locked down.
 * Google Fonts are allowed only for the theme preview (the admin's own font is self-hosted by next/font).
 */
function contentSecurityPolicy(): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : [])],
    'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    'img-src': ["'self'", 'https:', 'data:', 'blob:', ...(isDev ? ['http:'] : [])],
    'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
    'connect-src': ["'self'", ...(sameOrigin ? [] : [apiOrigin()]), ...(isDev ? ['ws:', 'wss:'] : [])],
    'media-src': ["'self'"],
    'worker-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
    'frame-src': ["'none'"],
    'frame-ancestors': ["'none'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
  };
  const policy = Object.entries(directives).map(([name, values]) => `${name} ${values.join(' ')}`);
  if (httpsDeployment) policy.push('upgrade-insecure-requests');
  return policy.join('; ');
}

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy() },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  {
    key: 'Permissions-Policy',
    value:
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), hid=(), midi=(), magnetometer=(), gyroscope=(), accelerometer=(), browsing-topics=(), interest-cohort=()',
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
  ...(httpsDeployment
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
    : []),
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  async rewrites() {
    const target = proxyTarget();
    return target ? [{ source: '/api/v1/:path*', destination: `${target}/api/v1/:path*` }] : [];
  },
};

export default nextConfig;
