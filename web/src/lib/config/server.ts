import { cacheLife, cacheTag } from "next/cache";
import type { AnySection, CmsPage, Plan, PublicConfig } from "@/lib/api/types";
import "server-only";
import { serverApiBaseUrl } from "@/lib/env.server";
import { logger } from "@/lib/logger";
import { DEFAULT_CONFIG, DEFAULT_PAGES, DEFAULT_PLANS, DEFAULT_SECTIONS } from "./defaults";
import { normalizeConfig, normalizePlans, normalizeSections } from "./normalize";

/**
 * Server-side readers for the public CMS/config endpoints.
 *
 * Next 16 + Cache Components: each reader is a `'use cache'` function tagged `config` (plus a
 * narrower tag) with a 5-minute lifetime — the equivalent of `fetch(..., { next: { revalidate: 300,
 * tags: ['config'] } })` in the previous caching model. `POST /api/revalidate` expires the tags
 * on demand after an admin edit.
 *
 * If the API is unreachable (e.g. `next build` with the backend offline) they return the bundled
 * defaults with a short lifetime so the real content replaces them soon after the API is back.
 */

const TIMEOUT_MS = 3000;

type FetchResult<T> = { ok: true; data: T } | { ok: false; status: number };

/** Never throws: any failure (timeout, network, bad JSON, non-2xx) becomes `{ ok: false }` and a warning. */
async function fetchPublic<T>(path: string): Promise<FetchResult<T>> {
  const route = path.split("?")[0];
  try {
    const res = await fetch(`${serverApiBaseUrl()}${path}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      if (res.status !== 404) logger.warn("public API request failed; using fallback", { route, status: res.status, requestId: res.headers.get("x-request-id") });
      return { ok: false, status: res.status };
    }
    const json: unknown = await res.json();
    if (json && typeof json === "object" && (json as { success?: unknown }).success === true) {
      return { ok: true, data: (json as { data: T }).data };
    }
    logger.warn("public API returned an unexpected body; using fallback", { route });
    return { ok: false, status: 502 };
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    logger.warn(timedOut ? "public API timed out; using bundled fallback" : "public API unreachable; using bundled fallback", { route });
    return { ok: false, status: 0 };
  }
}

/** Run a normaliser defensively: a malformed admin value must never crash a page render. */
function safely<T>(fn: () => T | null, route: string): T | null {
  try {
    return fn();
  } catch {
    logger.warn("public config could not be normalised; using fallback", { route });
    return null;
  }
}

export async function getPublicConfig(): Promise<PublicConfig> {
  "use cache";
  cacheTag("config");
  const res = await fetchPublic<unknown>("/public/config?platform=web");
  const config = res.ok ? safely(() => normalizeConfig(res.data), "/public/config") : null;
  if (config) {
    cacheLife({ stale: 300, revalidate: 300, expire: 86400 });
    return config;
  }
  cacheLife({ stale: 60, revalidate: 60, expire: 3600 });
  return DEFAULT_CONFIG;
}

export async function getSections(page: string): Promise<AnySection[]> {
  "use cache";
  cacheTag("config", "sections", `sections:${page}`);
  const res = await fetchPublic<unknown>(`/public/sections?page=${encodeURIComponent(page)}&platform=web`);
  const sections = res.ok ? safely(() => normalizeSections(res.data), "/public/sections") : null;
  if (sections) {
    cacheLife({ stale: 300, revalidate: 300, expire: 86400 });
    return sections;
  }
  cacheLife({ stale: 60, revalidate: 60, expire: 3600 });
  return DEFAULT_SECTIONS[page] ?? [];
}

export async function getPlans(): Promise<Plan[]> {
  "use cache";
  cacheTag("config", "plans");
  const res = await fetchPublic<unknown>("/public/plans");
  const plans = res.ok ? safely(() => normalizePlans(res.data), "/public/plans") : null;
  if (plans) {
    cacheLife({ stale: 300, revalidate: 300, expire: 86400 });
    return plans;
  }
  cacheLife({ stale: 60, revalidate: 60, expire: 3600 });
  return DEFAULT_PLANS;
}

/** Returns the published CMS page, or `null` when it does not exist (→ 404). */
export async function getCmsPage(slug: string): Promise<CmsPage | null> {
  "use cache";
  cacheTag("config", "pages", `page:${slug}`);
  const res = await fetchPublic<CmsPage>(`/public/pages/${encodeURIComponent(slug)}`);
  if (res.ok && res.data && typeof res.data.content === "string") {
    cacheLife({ stale: 300, revalidate: 300, expire: 86400 });
    return res.data;
  }
  if (!res.ok && res.status === 404) {
    cacheLife({ stale: 300, revalidate: 300, expire: 86400 });
    return null;
  }
  // API unreachable: serve the bundled copy of the seeded pages (if any).
  cacheLife({ stale: 60, revalidate: 60, expire: 3600 });
  return DEFAULT_PAGES[slug] ?? null;
}

/** Slugs worth prerendering: seeded pages + any `/p/<slug>` link in the header/footer navigation. */
export async function getKnownPageSlugs(): Promise<string[]> {
  const config = await getPublicConfig();
  const slugs = new Set(Object.keys(DEFAULT_PAGES));
  for (const item of [...config.navigation.header, ...config.navigation.footer]) {
    const match = /^\/p\/([a-z0-9-]+)\/?$/i.exec(item.href);
    if (match) slugs.add(match[1]);
  }
  return [...slugs];
}

/** The current year, cached per day (avoids `new Date()` in the prerendered shell). */
export async function getCurrentYear(): Promise<number> {
  "use cache";
  cacheLife("days");
  return new Date().getFullYear();
}
