'use client';

import { RotateCcw, Save } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

interface SaveBarProps {
  isDirty: boolean;
  isSaving: boolean;
  onReset?: () => void;
  canSave?: boolean;
  saveLabel?: string;
  /** Shown when the admin cannot save (role too low). */
  readOnlyMessage?: string;
  className?: string;
}

/** Sticky footer for long forms. Must be rendered inside the <form> (the save button submits it). */
export function SaveBar({
  isDirty,
  isSaving,
  onReset,
  canSave = true,
  saveLabel = 'Save changes',
  readOnlyMessage,
  className,
}: SaveBarProps) {
  return (
    <div
      className={cn(
        'sticky bottom-0 z-10 -mx-4 mt-6 border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8',
        className,
      )}
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {!canSave
            ? (readOnlyMessage ?? 'Read-only: your role cannot change this.')
            : isDirty
              ? 'You have unsaved changes.'
              : 'All changes saved.'}
        </p>
        {canSave ? (
          <div className="flex items-center gap-2">
            {onReset ? (
              <Button type="button" variant="ghost" disabled={!isDirty || isSaving} onClick={onReset}>
                <RotateCcw /> Discard
              </Button>
            ) : null}
            <Button type="submit" disabled={!isDirty || isSaving}>
              {isSaving ? <Spinner /> : <Save />}
              {saveLabel}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
