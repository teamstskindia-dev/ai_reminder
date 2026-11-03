import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/common/markdown";
import { getCmsPage, getKnownPageSlugs } from "@/lib/config/server";
import { safeImageUrl } from "@/lib/safe-url";

// The whole route is static output: unknown slugs are rendered (and cached) before the response is
// sent, so a missing page returns a real 404 instead of streaming the not-found UI with a 200.
export const ensureStatic = "navigation";

export async function generateStaticParams() {
  const slugs = await getKnownPageSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/p/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const page = await getCmsPage(slug);
  if (!page) return { title: "Page not found" };
  return {
    title: page.seo?.title || page.title,
    description: page.seo?.description ?? undefined,
    openGraph: safeImageUrl(page.seo?.ogImageUrl) ? { images: [{ url: safeImageUrl(page.seo?.ogImageUrl) as string }] } : undefined,
  };
}

function formatUpdated(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(date);
}

export default async function CmsPageRoute({ params }: PageProps<"/p/[slug]">) {
  const { slug } = await params;
  const page = await getCmsPage(slug);
  if (!page) notFound();
  const updated = formatUpdated(page.updatedAt ?? page.publishedAt);

  return (
    <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6 sm:py-20">
      <header className="mb-10 space-y-3 border-b pb-8">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{page.title}</h1>
        {updated && <p className="text-sm text-muted-foreground">Updated {updated}</p>}
      </header>
      <Markdown size="lg">{page.content}</Markdown>
    </article>
  );
}
