"use client";

import { useEffect, useRef, useState, type ImgHTMLAttributes, type ReactNode } from "react";
import { safeImageUrl } from "@/lib/safe-url";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "onError"> & {
  src: string | null | undefined;
  /** Rendered instead of the image when `src` is empty or fails to load. */
  fallback?: ReactNode;
};

/**
 * Plain <img> for admin-provided media on arbitrary hosts (Cloudinary or anything else), so a new
 * host never breaks the page the way an unconfigured next/image domain would. Falls back on error,
 * including errors that fire before hydration.
 */
export function SafeImage({ src: rawSrc, fallback = null, alt = "", ...props }: Props) {
  const src = safeImageUrl(rawSrc);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const img = ref.current;
    // An image that failed before React hydrated never fires onError for us — detect it here.
    if (img && img.complete && img.naturalWidth === 0 && src) setFailedSrc(src);
  }, [src]);

  if (!src || failedSrc === src) return <>{fallback}</>;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote, admin-controlled hosts; see component docs
    <img ref={ref} src={src} alt={alt} referrerPolicy="no-referrer" onError={() => setFailedSrc(src)} {...props} />
  );
}
