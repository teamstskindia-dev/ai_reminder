"use client";

import { cn } from "@/lib/utils";
import { useBranding } from "@/providers/config-provider";
import { SafeImage } from "./safe-image";

interface LogoProps {
  /**
   * `auto`: light logo in light mode, dark logo in dark mode.
   * `onDark`: always the logo made for dark backgrounds (e.g. the app sidebar).
   * `onLight`: always the logo made for light backgrounds.
   */
  variant?: "auto" | "onDark" | "onLight";
  /** Show only the square mark (icon). */
  iconOnly?: boolean;
  className?: string;
}

/** Letter mark + wordmark used whenever an image is missing or fails to load. */
function Wordmark({ appName, iconOnly, onDark }: { appName: string; iconOnly?: boolean; onDark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        className="grid size-7 shrink-0 place-items-center rounded-[calc(var(--radius)*0.8)] bg-primary text-sm font-bold text-primary-foreground shadow-sm"
      >
        {appName.trim().charAt(0).toUpperCase() || "R"}
      </span>
      {!iconOnly && (
        <span className={cn("text-lg font-semibold tracking-tight", onDark ? "text-sidebar-foreground" : "text-foreground")}>
          {appName}
        </span>
      )}
    </span>
  );
}

export function Logo({ variant = "auto", iconOnly = false, className }: LogoProps) {
  const { appName, logoUrl, logoDarkUrl, iconUrl } = useBranding();
  const label = `${appName} home`;

  if (iconOnly) {
    return (
      <span className={cn("inline-flex items-center", className)} aria-label={label}>
        <SafeImage
          src={iconUrl}
          alt={appName}
          className="size-7 rounded-[calc(var(--radius)*0.8)] object-contain"
          fallback={<Wordmark appName={appName} iconOnly />}
        />
      </span>
    );
  }

  const imgClass = "h-7 w-auto max-w-[160px] object-contain object-left";

  if (variant === "onDark") {
    return (
      <span className={cn("inline-flex items-center", className)}>
        <SafeImage src={logoDarkUrl || logoUrl} alt={appName} className={imgClass} fallback={<Wordmark appName={appName} onDark />} />
      </span>
    );
  }

  if (variant === "onLight") {
    return (
      <span className={cn("inline-flex items-center", className)}>
        <SafeImage src={logoUrl} alt={appName} className={imgClass} fallback={<Wordmark appName={appName} />} />
      </span>
    );
  }

  return (
    <span className={cn("inline-flex items-center", className)}>
      <span className="contents dark:hidden">
        <SafeImage src={logoUrl} alt={appName} className={imgClass} fallback={<Wordmark appName={appName} />} />
      </span>
      <span className="hidden dark:contents">
        <SafeImage src={logoDarkUrl || logoUrl} alt={appName} className={imgClass} fallback={<Wordmark appName={appName} />} />
      </span>
    </span>
  );
}
