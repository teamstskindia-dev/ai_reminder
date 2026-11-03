'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

export function CopyButton({
  value,
  label = 'Copy',
  showLabel = false,
  size = 'icon-sm',
}: {
  value: string;
  label?: string;
  showLabel?: boolean;
  size?: 'icon-sm' | 'icon-xs' | 'sm';
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy — your browser blocked clipboard access');
    }
  };
  return (
    <Button type="button" variant="ghost" size={showLabel ? 'sm' : size} onClick={copy} aria-label={label}>
      {copied ? <Check /> : <Copy />}
      {showLabel ? label : null}
    </Button>
  );
}
