import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/analytics", "/calendar", "/action-items", "/reminders", "/ask", "/notifications", "/settings", "/auth/", "/api/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
