import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { GoogleButton, GoogleButtonFallback } from "@/components/auth/google-button";
import { Logo } from "@/components/brand/logo";
import { SafeImage } from "@/components/brand/safe-image";
import type { SectionContent } from "@/lib/api/types";
import { DEFAULT_SECTIONS } from "@/lib/config/defaults";
import { getPublicConfig, getSections } from "@/lib/config/server";

export const metadata: Metadata = { title: "Sign in" };

async function getLoginHero(): Promise<SectionContent["hero"]> {
  const sections = await getSections("login");
  const hero = sections.find((s) => s.type === "hero") ?? DEFAULT_SECTIONS.login.find((s) => s.type === "hero");
  if (hero?.type === "hero") return hero.content;
  throw new Error("Missing login hero section");
}

export default async function LoginPage() {
  const [hero, config] = await Promise.all([getLoginHero(), getPublicConfig()]);
  const label = hero.primaryCta?.label || "Continue with Google";
  const href = hero.primaryCta?.href || "/auth/google";

  return (
    <main className="grid min-h-svh flex-1 lg:grid-cols-2">
      <div className="flex flex-col px-6 py-8 sm:px-10">
        <Link href="/" className="inline-flex w-fit">
          <Logo />
        </Link>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8 py-12">
          <div className="space-y-3">
            {hero.eyebrow && <p className="text-sm font-semibold text-primary">{hero.eyebrow}</p>}
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{hero.title}</h1>
            {hero.subtitle && <p className="text-pretty text-muted-foreground">{hero.subtitle}</p>}
          </div>

          <div className="space-y-4">
            <Suspense fallback={<GoogleButtonFallback label={label} href={href} />}>
              <GoogleButton label={label} href={href} />
            </Suspense>
            {!config.features.signupsEnabled && (
              <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
                New sign-ups are paused right now. Existing accounts can still sign in.
              </p>
            )}
          </div>

          {hero.badges?.length > 0 && (
            <ul className="space-y-2.5">
              {hero.badges.map((badge) => (
                <li key={badge} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                  <ShieldCheck className="size-4 shrink-0 text-brand-accent" aria-hidden="true" />
                  {badge}
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="text-center text-xs text-muted-foreground">
          By continuing you agree to our{" "}
          <Link href="/p/terms" className="underline underline-offset-4 hover:text-foreground">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/p/privacy" className="underline underline-offset-4 hover:text-foreground">
            Privacy policy
          </Link>
          .
        </p>
      </div>

      <div className="relative hidden overflow-hidden bg-sidebar lg:block">
        <SafeImage src={hero.imageUrl} alt="" className="absolute inset-0 size-full object-cover" />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-sidebar via-sidebar/40 to-primary/30" />
        <div className="absolute inset-x-0 bottom-0 space-y-3 p-12 text-sidebar-foreground">
          <Logo variant="onDark" />
          <p className="max-w-md text-2xl font-semibold tracking-tight text-balance">{config.branding.tagline}</p>
        </div>
      </div>
    </main>
  );
}
