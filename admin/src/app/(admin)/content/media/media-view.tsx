'use client';

import { ExternalLink, ImageIcon, Pencil, Trash2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { RoleGate } from '@/components/auth/role-gate';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { CopyButton } from '@/components/common/copy-button';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState, ErrorState } from '@/components/common/states';
import { DataTablePagination } from '@/components/data-table/data-table-pagination';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { SearchInput } from '@/components/data-table/search-input';
import { MediaGrid } from '@/components/media/media-grid';
import { UploadDropzone } from '@/components/media/upload-dropzone';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useListParams } from '@/hooks/use-url-state';
import { useDeleteMedia, useMedia } from '@/lib/api/media';
import type { MediaAsset } from '@/lib/api/types';

import { EditAltDialog } from './edit-alt-dialog';
import { SafeLink } from '@/components/common/safe-link';

function AssetActions({ asset, onEditAlt }: { asset: MediaAsset; onEditAlt: (asset: MediaAsset) => void }) {
  const remove = useDeleteMedia();
  const name = asset.publicId.split('/').pop() ?? asset.publicId;
  return (
    <div className="flex items-center justify-between gap-1">
      <div className="flex items-center">
        <CopyButton value={asset.url} label={`Copy URL of ${name}`} size="icon-xs" />
        <Button variant="ghost" size="icon-xs" asChild>
          <SafeLink href={asset.url} aria-label={`Open ${name} in a new tab`}>
            <ExternalLink />
          </SafeLink>
        </Button>
      </div>
      <RoleGate minRole="editor">
        <div className="flex items-center">
          <Button variant="ghost" size="icon-xs" aria-label={`Edit alt text of ${name}`} onClick={() => onEditAlt(asset)}>
            <Pencil />
          </Button>
          <ConfirmDialog
            title="Delete this image?"
            description="It is also deleted from Cloudinary. Pages, sections or settings that still use its URL will show a broken image."
            confirmLabel="Delete image"
            destructive
            onConfirm={() => remove.mutateAsync(asset.id)}
            trigger={
              <Button variant="ghost" size="icon-xs" aria-label={`Delete ${name}`}>
                <Trash2 />
              </Button>
            }
          />
        </div>
      </RoleGate>
    </div>
  );
}

export function MediaView() {
  const { url, page, limit, q, filters } = useListParams(['folder'] as const, { limit: 20 });
  const params = useMemo(
    () => ({ q: q || undefined, folder: filters.folder, page, limit }),
    [q, filters, page, limit],
  );
  const media = useMedia(params);
  const [uploadFolder, setUploadFolder] = useState('');
  const [altDialog, setAltDialog] = useState<{ open: boolean; asset: MediaAsset | null; key: number }>({
    open: false,
    asset: null,
    key: 0,
  });
  const { set } = url;
  const onFolderFilter = useCallback((folder: string) => set({ folder }), [set]);
  const openAlt = useCallback(
    (asset: MediaAsset) => setAltDialog((d) => ({ open: true, asset, key: d.key + 1 })),
    [],
  );

  const items = media.data?.items ?? [];
  const folders = [...new Set(items.map((a) => a.folder).filter((f): f is string => Boolean(f)))];

  return (
    <>
      <PageHeader
        title="Media library"
        description="Images stored in Cloudinary for logos, sections, banners and pages. Copy a URL or pick images from any image field."
      />

      <RoleGate minRole="editor">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Upload</CardTitle>
            <CardDescription>
              Uploads can fail in development because the Cloudinary credentials are dummies — every image field also
              accepts a pasted URL, so you never depend on uploads working.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
            <div className="space-y-2">
              <Label htmlFor="upload-folder">Folder (optional)</Label>
              <Input
                id="upload-folder"
                value={uploadFolder}
                onChange={(e) => setUploadFolder(e.target.value.trim())}
                placeholder="branding"
                list="media-folders"
              />
              <datalist id="media-folders">
                {folders.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
              <p className="text-xs text-muted-foreground">Groups uploads in Cloudinary and in the folder filter.</p>
            </div>
            <UploadDropzone folder={uploadFolder || undefined} className="p-6" />
          </CardContent>
        </Card>
      </RoleGate>

      <DataTableToolbar url={url} searchPlaceholder="Search name or alt text" extraKeys={['folder']}>
        <SearchInput
          value={url.get('folder') ?? ''}
          onChange={onFolderFilter}
          placeholder="Folder"
          aria-label="Filter by folder"
          className="sm:w-44"
        />
      </DataTableToolbar>

      {media.isPending ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" aria-busy="true">
          {Array.from({ length: 10 }, (_, i) => (
            <Skeleton key={i} className="aspect-[4/5] rounded-lg" />
          ))}
        </div>
      ) : media.isError ? (
        <ErrorState error={media.error} onRetry={() => void media.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<ImageIcon />}
          title={q || filters.folder ? 'No images match these filters' : 'No images yet'}
          description="Upload images above, or paste image URLs directly into any image field."
        />
      ) : (
        <div className={media.isFetching ? 'opacity-70 transition-opacity' : undefined}>
          <MediaGrid
            assets={items}
            renderActions={(asset) => <AssetActions asset={asset} onEditAlt={openAlt} />}
          />
          {media.data.meta.total > 0 ? <DataTablePagination meta={media.data.meta} url={url} /> : null}
        </div>
      )}

      <EditAltDialog
        key={altDialog.key}
        asset={altDialog.asset}
        open={altDialog.open}
        onOpenChange={(open) => setAltDialog((d) => ({ ...d, open }))}
      />
    </>
  );
}
