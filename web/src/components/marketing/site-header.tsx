import { cookies } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { SmartLink } from "@/components/common/smart-link";
import { Button } from "@/components/ui/button";
import { getPublicConfig } from "@/lib/config/server";
import { REFRESH_COOKIE } from "@/lib/env";
import { MobileNav } from "./mobile-nav";

function AuthButtons({ signedIn }: { signedIn: boolean }) {
  if (signedIn) {
    return (
      <Button asChild size="lg" className="px-4">
        <Link href="/dashboard">Open app</Link>
      </Button>
    );
  }
  return (
    <>
      <Button asChild variant="ghost" size="lg" className="hidden px-3 sm:inline-flex">
        <Link href="/login">Sign in</Link>
      </Button>
      <Button asChild size="lg" className="px-4">
        <Link href="/login">Get started</Link>
      </Button>
    </>
  );
}

/** Reads the refresh cookie at request time (streams into the prerendered shell). */
async function SessionAwareButtons() {
  const signedIn = Boolean((await cookies()).get(REFRESH_COOKIE)?.value);
  return <AuthButtons signedIn={signedIn} />;
}

export async function SiteHeader({ sessionAware = true }: { sessionAware?: boolean }) {
  const { navigation } = await getPublicConfig();
  const items = navigation.header;

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-lg supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="shrink-0 rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
          <Logo />
        </Link>
        <nav aria-label="Main" className="ml-6 hidden items-center gap-1 md:flex">
          {items.map((item) => (
            <SmartLink
              key={item.id}
              href={item.href}
              external={item.isExternal}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {item.label}
            </SmartLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {sessionAware ? (
            <Suspense fallback={<AuthButtons signedIn={false} />}>
              <SessionAwareButtons />
            </Suspense>
          ) : (
            <AuthButtons signedIn={false} />
          )}
          <MobileNav items={items} />
        </div>
      </div>
    </header>
  );
}
