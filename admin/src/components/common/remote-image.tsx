'use client';

import { ImageOff } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';

import { safeImageSrc } from '@/lib/security/safe-url';
import { cn } from '@/lib/utils';

interface RemoteImageProps {
  src: string | null | undefined;
  alt: string;
  /** Sizes the wrapper (the image fills it), e.g. "h-10 w-32". */
  className?: string;
  fit?: 'cover' | 'contain';
  /** object-position, e.g. "left" for logos. */
  position?: 'center' | 'left';
  /** Rendered when there is no usable src or it fails to load. */
  fallback?: React.ReactNode;
  rounded?: boolean;
}

/**
 * Renders any admin-entered image URL (Cloudinary, CDN, root-relative) without optimisation or host
 * allow-listing, guarding against half-typed URLs and broken links.
 */
export function RemoteImage({
  src,
  alt,
  className,
  fit = 'cover',
  position = 'center',
  fallback,
  rounded = false,
}: RemoteImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  // Only allow-listed URLs are rendered (https, dev-only http, root-relative); javascript:/data: never reach <img>.
  const safeSrc = safeImageSrc(src);
  const usable = safeSrc !== null && failedSrc !== safeSrc;

  return (
    <span className={cn('relative block shrink-0 overflow-hidden', rounded && 'rounded-md', className)}>
      {usable ? (
        <Image
          src={safeSrc}
          alt={alt}
          fill
          unoptimized
          sizes="100vw"
          onError={() => setFailedSrc(safeSrc)}
          className={cn(fit === 'contain' ? 'object-contain' : 'object-cover', position === 'left' && 'object-left')}
        />
      ) : (
        (fallback ?? (
          <span className="flex size-full items-center justify-center bg-muted text-muted-foreground">
            <ImageOff className="size-4" aria-hidden />
            <span className="sr-only">{src ? 'Image failed to load' : 'No image'}</span>
          </span>
        ))
      )}
    </span>
  );
}
