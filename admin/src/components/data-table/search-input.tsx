'use client';

import { Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  delay?: number;
  className?: string;
  'aria-label'?: string;
}

/** Search box that keeps its own text and reports it after a debounce. */
export function SearchInput({ value, onChange, placeholder = 'Search…', delay = 350, className, ...rest }: SearchInputProps) {
  const [text, setText] = useState(value);
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    // External change (e.g. "Reset filters"): adopt it.
    setPrevValue(value);
    setText(value);
  }

  useEffect(() => {
    if (text === value) return;
    const id = setTimeout(() => onChange(text.trim()), delay);
    return () => clearTimeout(id);
  }, [text, value, delay, onChange]);

  return (
    <div className={cn('relative w-full sm:w-72', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        aria-label={rest['aria-label'] ?? placeholder}
        className="pr-8 pl-8 [&::-webkit-search-cancel-button]:hidden"
      />
      {text ? (
        <button
          type="button"
          onClick={() => {
            setText('');
            onChange('');
          }}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
