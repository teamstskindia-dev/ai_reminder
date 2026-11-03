'use client';

import { ChevronLeft, ChevronRight, ImageIcon, Search } from 'lucide-react';
import { useState } from 'react';

import { EmptyState, ErrorState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAdminSession } from '@/components/auth/admin-session';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useMedia } from '@/lib/api/media';
import type { MediaAsset } from '@/lib/api/types';

import { MediaGrid } from './media-grid';
import { UploadDropzone } from './upload-dropzone';

interface MediaPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (asset: MediaAsset) => void;
  selectedUrl?: string | null;
  /** Default folder for uploads made from the picker. */
  folder?: string;
}

const PAGE_SIZE = 20;

/** Dialog over GET /admin/media with search, folder filter and an upload tab. */
export function MediaPicker({ open, onOpenChange, onSelect, selectedUrl, folder }: MediaPickerProps) {
  const { can } = useAdminSession();
  const [tab, setTab] = useState<'library' | 'upload'>('library');
  const [q, setQ] = useState('');
  const [folderFilter, setFolderFilter] = useState('');
  const [page, setPage] = useState(1);
  const debouncedQ = useDebouncedValue(q);
  const debouncedFolder = useDebouncedValue(folderFilter);
  const media = useMedia(
    { q: debouncedQ || undefined, folder: debouncedFolder || undefined, page, limit: PAGE_SIZE },
    { enabled: open },
  );

  const choose = (asset: MediaAsset) => {
    onSelect(asset);
    onOpenChange(false);
  };

  const folders = [...new Set((media.data?.items ?? []).map((a) => a.folder).filter((f): f is string => Boolean(f)))];
  const meta = media.data?.meta;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Media library</DialogTitle>
          <DialogDescription>Pick an image or upload a new one. You can always paste any URL instead.</DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'library' | 'upload')}>
          <TabsList>
            <TabsTrigger value="library">Library</TabsTrigger>
            <TabsTrigger value="upload" disabled={!can('editor')}>
              Upload
            </TabsTrigger>
          </TabsList>
          <TabsContent value="library" className="space-y-4 pt-2">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search by name or alt text"
                  className="pl-8"
                  aria-label="Search media"
                />
              </div>
              <Input
                value={folderFilter}
                onChange={(e) => {
                  setFolderFilter(e.target.value);
                  setPage(1);
                }}
                placeholder="Folder"
                list="media-picker-folders"
                className="sm:w-48"
                aria-label="Filter by folder"
              />
              <datalist id="media-picker-folders">
                {folders.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            </div>
            {media.isPending ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {Array.from({ length: 8 }, (_, i) => (
                  <Skeleton key={i} className="aspect-[4/5] rounded-lg" />
                ))}
              </div>
            ) : media.isError ? (
              <ErrorState error={media.error} onRetry={() => void media.refetch()} />
            ) : media.data.items.length === 0 ? (
              <EmptyState
                icon={<ImageIcon />}
                title="No images found"
                description={q || folderFilter ? 'Try a different search.' : 'Upload your first image from the Upload tab.'}
              />
            ) : (
              <MediaGrid
                assets={media.data.items}
                selectedUrl={selectedUrl}
                onSelect={choose}
                className="lg:grid-cols-4 xl:grid-cols-4"
              />
            )}
            {meta && meta.totalPages > 1 ? (
              <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
                <span>
                  Page {meta.page} of {meta.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Previous page"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Next page"
                  disabled={page >= meta.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight />
                </Button>
              </div>
            ) : null}
          </TabsContent>
          <TabsContent value="upload" className="pt-2">
            <UploadDropzone folder={folder} multiple={false} onUploaded={choose} />
            <p className="mt-3 text-xs text-muted-foreground">
              The uploaded image is selected automatically. If uploads fail (e.g. dummy Cloudinary credentials in
              development), close this dialog and paste an image URL instead.
            </p>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
