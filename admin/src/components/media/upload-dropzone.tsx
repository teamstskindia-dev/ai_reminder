'use client';

import { CloudUpload } from 'lucide-react';
import { useId, useRef, useState, type DragEvent } from 'react';
import { toast } from 'sonner';

import { Spinner } from '@/components/ui/spinner';
import { MEDIA_ACCEPT, MEDIA_ALLOWED_LABEL, useUploadMedia, validateMediaFile } from '@/lib/api/media';
import type { MediaAsset } from '@/lib/api/types';
import { cn } from '@/lib/utils';

interface UploadDropzoneProps {
  folder?: string;
  alt?: string;
  multiple?: boolean;
  onUploaded?: (asset: MediaAsset) => void;
  className?: string;
  disabled?: boolean;
}

/** Drag-and-drop (or click) image upload to POST /admin/media/upload. */
export function UploadDropzone({ folder, alt, multiple = true, onUploaded, className, disabled }: UploadDropzoneProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const upload = useUploadMedia();
  const [pendingCount, setPendingCount] = useState(0);

  const handleFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).slice(0, multiple ? 20 : 1);
    for (const file of list) {
      const problem = validateMediaFile(file);
      if (problem) {
        toast.error(problem);
        continue;
      }
      setPendingCount((c) => c + 1);
      try {
        const asset = await upload.mutateAsync({ file, folder: folder || undefined, alt: alt || undefined });
        onUploaded?.(asset);
      } catch {
        // toast already shown by the mutation
      } finally {
        setPendingCount((c) => c - 1);
      }
    }
  };

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    if (e.dataTransfer.files.length) void handleFiles(e.dataTransfer.files);
  };

  return (
    <label
      htmlFor={inputId}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors hover:bg-muted/50 focus-within:ring-3 focus-within:ring-ring/50',
        dragging && 'border-primary bg-primary/5',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
    >
      {pendingCount > 0 ? <Spinner className="size-6" /> : <CloudUpload className="size-7 text-muted-foreground" />}
      <div className="space-y-1">
        <p className="text-sm font-medium">
          {pendingCount > 0 ? `Uploading ${pendingCount} file${pendingCount > 1 ? 's' : ''}…` : 'Drop images here or click to browse'}
        </p>
        <p className="text-xs text-muted-foreground">{MEDIA_ALLOWED_LABEL} · up to 10 MB</p>
      </div>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={MEDIA_ACCEPT}
        multiple={multiple}
        disabled={disabled}
        className="sr-only"
        onChange={(e) => {
          if (e.target.files?.length) void handleFiles(e.target.files);
          if (inputRef.current) inputRef.current.value = '';
        }}
      />
    </label>
  );
}
