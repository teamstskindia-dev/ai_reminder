'use client';

import { AvatarImage } from '@/components/ui/avatar';
import { safeImageSrc } from '@/lib/security/safe-url';

/** AvatarImage that only loads allow-listed image URLs (otherwise the AvatarFallback shows). */
export function SafeAvatarImage({ src, alt = '' }: { src: string | null | undefined; alt?: string }) {
  const safe = safeImageSrc(src);
  return safe ? <AvatarImage src={safe} alt={alt} /> : null;
}
