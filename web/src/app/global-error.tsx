"use client";

import Link from "next/link";
import { useEffect } from "react";
import { getErrorInfo } from "@/lib/api/errors";
import { reportError } from "@/lib/logger";
import "./globals.css";

/** Last-resort boundary: replaces the root layout, so it cannot rely on config or providers. */
export default function GlobalError({ error, reset, retry }: { error: unknown; reset: () => void; retry?: () => void }) {
  useEffect(() => {
    reportError(error, { where: "global" });
  }, [error]);
  const info = getErrorInfo(error, "An unexpected error occurred.");

  return (
    <html lang="en">
      <body className="flex min-h-svh items-center justify-center bg-background px-4 font-sans text-foreground antialiased">
        <main role="alert" className="flex max-w-md flex-col items-center gap-4 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
          <p className="text-muted-foreground">{info.message}</p>
          {info.reference && (
            <p className="text-xs text-muted-foreground">
              Reference: <code className="font-mono">{info.reference}</code>
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => (retry ?? reset)()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Try again
            </button>
            <Link href="/" className="rounded-md border px-4 py-2 text-sm font-medium">
              Go home
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}
