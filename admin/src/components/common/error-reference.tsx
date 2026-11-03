'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

import { cn } from '@/lib/utils';

/** "Reference: abc-123" with a copy button, for support to find the server log line. */
export function ErrorReference({ reference, className }: { reference: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(reference);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: the reference stays selectable.
    }
  };
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs text-muted-foreground', className)}>
      Reference: <code className="rounded bg-muted px-1.5 py-0.5 font-mono select-all">{reference}</code>
      <button
        type="button"
        onClick={copy}
        className="rounded p-0.5 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        aria-label={copied ? 'Reference copied' : 'Copy reference'}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
    </span>
  );
}
