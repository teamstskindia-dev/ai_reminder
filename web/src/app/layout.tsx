import type { Metadata } from "next";
import { getPublicConfig } from "@/lib/config/server";
import { googleFontUrls, themeToCss } from "@/lib/config/theme";
import { SITE_URL } from "@/lib/env";
import { safeImageUrl } from "@/lib/safe-url";
import { AppProviders } from "@/providers/app-providers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const { seo, branding } = await getPublicConfig();
  const ogImage = safeImageUrl(seo.ogImageUrl);
  const favicon = safeImageUrl(branding.faviconUrl);
  const appleIcon = safeImageUrl(branding.iconUrl);
  const images = ogImage ? [{ url: ogImage, width: 1200, height: 630, alt: branding.appName }] : [];
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: seo.title || branding.appName, template: `%s · ${branding.appName}` },
    description: seo.description || branding.tagline,
    keywords: seo.keywords,
    applicationName: branding.appName,
    authors: [{ name: branding.companyName }],
    icons: {
      icon: favicon ? [{ url: favicon }] : undefined,
      apple: appleIcon ? [{ url: appleIcon }] : undefined,
    },
    openGraph: {
      type: "website",
      siteName: branding.appName,
      title: seo.title || branding.appName,
      description: seo.description || branding.tagline,
      images,
    },
    twitter: {
      card: images.length ? "summary_large_image" : "summary",
      title: seo.title || branding.appName,
      description: seo.description || branding.tagline,
      images: images.map((i) => i.url),
    },
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const config = await getPublicConfig();
  const fontUrls = googleFontUrls(config.theme.fontFamily);

  return (
    <html lang="en" suppressHydrationWarning className="h-full antialiased">
      <head>
        {/* Runtime font from the admin theme (next/font needs build-time names). */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {fontUrls.map((href) => (
          <link key={href} rel="stylesheet" href={href} />
        ))}
        {/* Admin-controlled colours / radius / font → CSS variables behind every Tailwind + shadcn token. */}
        <style id="remi-theme" dangerouslySetInnerHTML={{ __html: themeToCss(config.theme) }} />
      </head>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <AppProviders config={config}>{children}</AppProviders>
      </body>
    </html>
  );
}
