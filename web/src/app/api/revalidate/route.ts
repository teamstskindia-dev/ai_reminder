import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { revalidateSecret } from "@/lib/env.server";
import { logger, reportError } from "@/lib/logger";

/**
 * On-demand revalidation webhook, called by the backend after admin edits (HLD §5.6).
 * POST { tags: string[] } with header `x-revalidate-secret: $REVALIDATE_SECRET`.
 * Only POST is exported, so every other method gets 405 from Next.
 */

const MAX_BODY_BYTES = 4 * 1024;
const MAX_TAGS = 32;
/** Tags this app actually uses (see lib/config/server.ts). */
const TAG_ALLOWLIST = /^(config|sections|pages|plans)$|^sections:[a-z0-9_-]{1,64}$|^page:[a-z0-9-]{1,128}$/;

function secretMatches(provided: string | null): boolean {
  const expected = revalidateSecret();
  if (!expected || !provided) return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  // timingSafeEqual throws on different lengths; compare against itself to keep timing uniform.
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

const json = (body: object, status: number) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

export async function POST(request: NextRequest) {
  if (!secretMatches(request.headers.get("x-revalidate-secret"))) {
    logger.warn("revalidate rejected: invalid secret");
    return json({ revalidated: false }, 401);
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_BODY_BYTES) {
    logger.warn("revalidate rejected: body too large", { bytes: declaredLength });
    return json({ revalidated: false, error: "Body too large" }, 413);
  }

  let tags: string[] = [];
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return json({ revalidated: false, error: "Body too large" }, 413);
    const body: unknown = JSON.parse(text);
    const raw = (body as { tags?: unknown } | null)?.tags;
    if (Array.isArray(raw)) tags = raw.filter((t): t is string => typeof t === "string" && TAG_ALLOWLIST.test(t));
  } catch {
    return json({ revalidated: false, error: "Body must be JSON: { tags: string[] }" }, 400);
  }

  const unique = [...new Set(tags)].slice(0, MAX_TAGS);
  if (unique.length === 0) {
    logger.warn("revalidate rejected: no allowed tags");
    return json({ revalidated: false, error: "No allowed tags provided" }, 400);
  }

  try {
    // External webhook: expire immediately so the next request renders fresh content.
    for (const tag of unique) revalidateTag(tag, { expire: 0 });
  } catch (error) {
    reportError(error, { where: "api/revalidate" });
    return json({ revalidated: false }, 500);
  }

  logger.info("revalidated tags", { tags: unique.join(",") });
  return json({ revalidated: true, tags: unique }, 200);
}
