'use client';

import { useState, type ReactNode } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { getErrorMessage, getErrorReference, markErrorHandled } from '@/lib/api/errors';

import { ErrorReference } from './error-reference';

interface ConfirmDialogProps {
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** Require typing this exact text before confirming (e.g. the user's email). */
  typeToConfirm?: string;
  /** Resolve to close; throw to keep the dialog open and show the error inline. */
  onConfirm: () => Promise<unknown> | unknown;
  /** Uncontrolled usage: the element that opens the dialog. */
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  typeToConfirm,
  onConfirm,
  trigger,
  open: openProp,
  onOpenChange,
  children,
}: ConfirmDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<{ message: string; reference: string | null } | null>(null);
  const open = openProp ?? internalOpen;

  const setOpen = (next: boolean) => {
    if (pending) return;
    if (!next) {
      setTyped('');
      setError(null);
    }
    if (openProp === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  };

  const confirmDisabled = pending || (typeToConfirm !== undefined && typed.trim() !== typeToConfirm);

  const handleConfirm = async (event: React.MouseEvent) => {
    event.preventDefault();
    if (confirmDisabled) return;
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      setPending(false);
      setTyped('');
      if (openProp === undefined) setInternalOpen(false);
      onOpenChange?.(false);
    } catch (err) {
      // Shown inline below, so the global toast is skipped.
      markErrorHandled(err);
      setPending(false);
      setError({ message: getErrorMessage(err), reference: getErrorReference(err) });
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {trigger ? <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger> : null}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        {children}
        {typeToConfirm !== undefined ? (
          <div className="space-y-2">
            <Label htmlFor="confirm-text" className="text-sm font-normal">
              Type <span className="font-mono font-semibold">{typeToConfirm}</span> to confirm
            </Label>
            <Input
              id="confirm-text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoFocus
            />
          </div>
        ) : null}
        {error ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription className="space-y-1">
              <p>{error.message}</p>
              {error.reference ? <ErrorReference reference={error.reference} /> : null}
            </AlertDescription>
          </Alert>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={confirmDisabled}
            variant={destructive ? 'destructive' : 'default'}
            className={destructive ? 'bg-destructive text-white hover:bg-destructive/90 dark:bg-destructive/80' : undefined}
          >
            {pending ? <Spinner /> : null}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
