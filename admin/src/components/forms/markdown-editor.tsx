'use client';

import { Columns2, Eye, Pencil } from 'lucide-react';
import { useState } from 'react';
import type { FieldPath, FieldValues } from 'react-hook-form';

import { Markdown } from '@/components/common/markdown';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

import { FormField, type BaseFieldProps } from './fields';

type Mode = 'split' | 'write' | 'preview';

interface MarkdownEditorProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

/** Markdown textarea with a live preview side by side (stacked tabs on small screens). */
export function MarkdownEditor({
  id,
  value,
  onChange,
  onBlur,
  rows = 16,
  placeholder = 'Write markdown…',
  disabled,
  className,
  ...aria
}: MarkdownEditorProps) {
  const [mode, setMode] = useState<Mode>('split');
  return (
    <div className={cn('overflow-hidden rounded-lg border', className)}>
      <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-2 py-1.5">
        <span className="text-xs text-muted-foreground">Markdown · GitHub flavoured</span>
        <ToggleGroup
          type="single"
          size="sm"
          value={mode}
          onValueChange={(v) => v && setMode(v as Mode)}
          aria-label="Editor layout"
        >
          <ToggleGroupItem value="write" aria-label="Write only">
            <Pencil />
          </ToggleGroupItem>
          <ToggleGroupItem value="split" aria-label="Side by side" className="hidden md:inline-flex">
            <Columns2 />
          </ToggleGroupItem>
          <ToggleGroupItem value="preview" aria-label="Preview only">
            <Eye />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className={cn('grid', mode === 'split' && 'md:grid-cols-2')}>
        <Textarea
          id={id}
          value={value}
          rows={rows}
          placeholder={placeholder}
          disabled={disabled}
          onBlur={onBlur}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'min-h-64 resize-y rounded-none border-0 font-mono text-xs leading-relaxed shadow-none focus-visible:ring-0',
            mode === 'preview' && 'hidden',
            mode === 'split' && 'max-md:hidden md:border-r',
          )}
          {...aria}
        />
        <div
          className={cn(
            'max-h-[36rem] min-h-64 overflow-auto bg-background p-4',
            mode === 'write' && 'hidden',
            mode === 'split' && 'hidden md:block',
          )}
          aria-label="Preview"
        >
          {value.trim() ? (
            <Markdown>{value}</Markdown>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function MarkdownField<T extends FieldValues, N extends FieldPath<T>, TT extends FieldValues = T>({
  rows,
  placeholder,
  ...props
}: BaseFieldProps<T, N, TT> & { rows?: number; placeholder?: string }) {
  return (
    <FormField
      {...props}
      render={({ field, id, aria }) => (
        <MarkdownEditor
          id={id}
          value={(field.value as string | undefined) ?? ''}
          onChange={field.onChange}
          onBlur={field.onBlur}
          rows={rows}
          placeholder={placeholder}
          disabled={field.disabled}
          {...aria}
        />
      )}
    />
  );
}
