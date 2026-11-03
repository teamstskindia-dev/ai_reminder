'use client';

import { Braces, CheckCircle2, TriangleAlert } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface JsonEditorProps {
  id?: string;
  value: unknown;
  /** Called with the parsed value whenever the text is valid JSON. */
  onChange: (value: unknown) => void;
  /** Optional extra validation of the parsed value; return an error message or null. */
  validate?: (value: unknown) => string | null;
  rows?: number;
  disabled?: boolean;
  className?: string;
  label?: string;
}

function pretty(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? '';
  } catch {
    return '';
  }
}

/**
 * Raw JSON fallback editor. Keeps its own text so invalid intermediate input never reaches the form;
 * remount it (change `key`) to load a new external value.
 */
export function JsonEditor({ id, value, onChange, validate, rows = 18, disabled, className, label }: JsonEditorProps) {
  const [text, setText] = useState(() => pretty(value));
  const [error, setError] = useState<string | null>(null);

  const handle = (next: string) => {
    setText(next);
    try {
      const parsed: unknown = JSON.parse(next);
      const problem = validate?.(parsed) ?? null;
      setError(problem);
      if (!problem) onChange(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid JSON');
    }
  };

  const format = () => {
    try {
      setText(JSON.stringify(JSON.parse(text), null, 2));
    } catch {
      // keep the text as-is; the error is already displayed
    }
  };

  return (
    <div className={cn('space-y-2', className)}>
      <Textarea
        id={id}
        value={text}
        rows={rows}
        spellCheck={false}
        disabled={disabled}
        aria-label={label ?? 'JSON'}
        aria-invalid={Boolean(error)}
        onChange={(e) => handle(e.target.value)}
        className="font-mono text-xs leading-relaxed"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p
          className={cn('flex items-center gap-1.5 text-xs', error ? 'text-destructive' : 'text-muted-foreground')}
          role={error ? 'alert' : undefined}
        >
          {error ? <TriangleAlert className="size-3.5" /> : <CheckCircle2 className="size-3.5 text-emerald-600" />}
          {error ?? 'Valid JSON — changes apply to the form.'}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={format} disabled={disabled || Boolean(error)}>
          <Braces /> Format
        </Button>
      </div>
    </div>
  );
}

/** Read-only pretty JSON block. */
export function JsonView({ value, className }: { value: unknown; className?: string }) {
  return (
    <pre className={cn('max-h-96 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed', className)}>
      {pretty(value) || 'null'}
    </pre>
  );
}
