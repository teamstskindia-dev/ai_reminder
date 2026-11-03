'use client';

import { Check } from 'lucide-react';
import type { ReactNode } from 'react';

import { RemoteImage } from '@/components/common/remote-image';
import type { MediaAsset } from '@/lib/api/types';
import { cn, formatBytes } from '@/lib/utils';

interface MediaGridProps {
  assets: MediaAsset[];
  selectedUrl?: string | null;
  onSelect?: (asset: MediaAsset) => void;
  renderActions?: (asset: MediaAsset) => ReactNode;
  className?: string;
}

export function MediaGrid({ assets, selectedUrl, onSelect, renderActions, className }: MediaGridProps) {
  return (
    <ul className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5', className)}>
      {assets.map((asset) => {
        const selected = selectedUrl === asset.url;
        const body = (
          <>
            <div className="relative aspect-square overflow-hidden rounded-t-lg bg-[repeating-conic-gradient(var(--muted)_0_25%,transparent_0_50%)] bg-[length:16px_16px]">
              <RemoteImage src={asset.url} alt={asset.alt ?? asset.publicId} fit="contain" className="size-full" />
              {selected ? (
                <span className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                  <Check className="size-3.5" />
                </span>
              ) : null}
            </div>
            <div className="space-y-0.5 p-2 text-left">
              <p className="truncate text-xs font-medium" title={asset.publicId}>
                {asset.publicId.split('/').pop()}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {[asset.format?.toUpperCase(), asset.width && asset.height ? `${asset.width}×${asset.height}` : null, formatBytes(asset.bytes, '')]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
          </>
        );
        return (
          <li
            key={asset.id}
            className={cn(
              'group relative overflow-hidden rounded-lg border bg-card transition-shadow hover:shadow-sm',
              selected && 'ring-2 ring-primary',
            )}
          >
            {onSelect ? (
              <button
                type="button"
                className="block w-full focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                onClick={() => onSelect(asset)}
                aria-pressed={selected}
                aria-label={`Select ${asset.alt ?? asset.publicId}`}
              >
                {body}
              </button>
            ) : (
              body
            )}
            {renderActions ? <div className="border-t p-1.5">{renderActions(asset)}</div> : null}
          </li>
        );
      })}
    </ul>
  );
}
