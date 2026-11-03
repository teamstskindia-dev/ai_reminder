import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";

/**
 * CMS pages are fully static (`ensureStatic` on the page) so an unknown slug can return a real 404.
 * That rules out reading cookies, so this header is not session-aware; signed-in visitors who click
 * "Sign in" are sent straight to the app by the proxy.
 */
export default function CmsLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader sessionAware={false} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
