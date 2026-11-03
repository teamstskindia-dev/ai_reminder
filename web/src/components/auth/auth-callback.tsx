"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { authApi } from "@/lib/api/auth";
import type { ExchangeResult } from "@/lib/api/types";
import { NEXT_COOKIE } from "@/lib/env";
import { qk } from "@/lib/query-keys";
import { safeNext } from "@/lib/safe-next";
import { useBranding } from "@/providers/config-provider";

// One-time codes are single use: de-duplicate across StrictMode double effects / re-renders.
const exchanges = new Map<string, Promise<ExchangeResult>>();

function exchangeOnce(code: string) {
  let pending = exchanges.get(code);
  if (!pending) {
    pending = authApi.exchange(code);
    exchanges.set(code, pending);
  }
  return pending;
}

function readNextCookie(): string | null {
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${NEXT_COOKIE}=`));
  document.cookie = `${NEXT_COOKIE}=; Max-Age=0; path=/`;
  return match ? match.slice(NEXT_COOKIE.length + 1) : null;
}

function errorCopy(code: string, appName: string, supportEmail: string): { title: string; body: string } {
  switch (code) {
    case "access_denied":
      return {
        title: "Google sign-in was cancelled",
        body: `${appName} needs access to your Google account and calendar to join your meetings. You can try again whenever you're ready.`,
      };
    case "account_suspended":
      return {
        title: "Your account is suspended",
        body: `This account can't sign in right now. Contact ${supportEmail || "support"} if you think this is a mistake.`,
      };
    case "signups_disabled":
      return {
        title: "Sign-ups are paused",
        body: `${appName} isn't accepting new accounts at the moment. Existing users can still sign in.`,
      };
    case "oauth_failed":
      return {
        title: "We couldn't complete sign-in with Google",
        body: "Something went wrong while talking to Google. Please try again.",
      };
    case "exchange_failed":
      return {
        title: "This sign-in link has expired",
        body: "Sign-in links can only be used once and expire after a minute. Please start again.",
      };
    case "missing_code":
      return {
        title: "Nothing to sign in with",
        body: "This page is only used to finish Google sign-in. Start from the sign-in page.",
      };
    default:
      return { title: "Sign-in failed", body: "Something went wrong. Please try again." };
  }
}

export function AuthCallback() {
  const params = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { appName, supportEmail } = useBranding();
  const code = params.get("code");
  const urlError = params.get("error");
  const [exchangeError, setExchangeError] = useState<string | null>(null);
  const error = urlError ?? (code ? exchangeError : "missing_code");

  useEffect(() => {
    if (!code || urlError) return;
    let active = true;
    exchangeOnce(code)
      .then((result) => {
        if (!active) return;
        queryClient.removeQueries({ queryKey: qk.session });
        const next = safeNext(readNextCookie()); // same-origin path or /dashboard
        const destination = result.isNewUser ? "/analytics/reports?action=welcomeCalendarSuccess" : next;
        router.replace(destination);
      })
      .catch(() => {
        if (active) setExchangeError("exchange_failed");
      });
    return () => {
      active = false;
    };
  }, [code, urlError, queryClient, router]);

  if (error) {
    const copy = errorCopy(error, appName, supportEmail);
    return (
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-6 text-center">
        <div className="grid size-12 place-items-center rounded-full bg-destructive/10 text-destructive">
          <AlertCircle className="size-6" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>
          <p className="text-muted-foreground">{copy.body}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {error !== "account_suspended" && error !== "signups_disabled" && (
            <Button asChild size="lg">
              <a href="/auth/google">Try again</a>
            </Button>
          )}
          <Button asChild size="lg" variant="outline">
            <Link href="/">Back to home</Link>
          </Button>
        </div>
      </div>
    );
  }

  return <CallbackLoading />;
}

export function CallbackLoading() {
  return (
    <div className="flex flex-col items-center gap-4 text-center" role="status" aria-live="polite">
      <Loader2 className="size-8 animate-spin text-primary" aria-hidden="true" />
      <div className="space-y-1">
        <p className="text-lg font-medium">Signing you in…</p>
        <p className="text-sm text-muted-foreground">Connecting your account and calendar.</p>
      </div>
    </div>
  );
}

export function CallbackFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-svh flex-1 flex-col items-center justify-center gap-10 px-4">
      <Logo />
      {children}
    </main>
  );
}
