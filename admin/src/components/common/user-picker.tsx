'use client';

import { Check, ChevronsUpDown, X } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Spinner } from '@/components/ui/spinner';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useUser, useUsers } from '@/lib/api/users';
import type { AdminUserListItem } from '@/lib/api/types';
import { cn } from '@/lib/utils';

export interface PickedUser {
  id: string;
  email: string;
  name: string | null;
}

function useUserSearch(open: boolean) {
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search, 250);
  const users = useUsers({ q: q || undefined, limit: 10 }, { enabled: open });
  return { search, setSearch, users };
}

function UserOption({ user, selected }: { user: AdminUserListItem; selected: boolean }) {
  return (
    <>
      <Check className={cn('size-4', selected ? 'opacity-100' : 'opacity-0')} />
      <div className="min-w-0">
        <p className="truncate text-sm">{user.name ?? user.email}</p>
        {user.name ? <p className="truncate text-xs text-muted-foreground">{user.email}</p> : null}
      </div>
    </>
  );
}

/** Single user picker searching GET /admin/users. */
export function UserPicker({
  value,
  onChange,
  placeholder = 'Any user',
  className,
}: {
  value: string | null;
  onChange: (user: PickedUser | null) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const { search, setSearch, users } = useUserSearch(open);
  const selected = useUser(value);
  const label = value ? (selected.data?.email ?? (selected.isPending ? 'Loading…' : 'Unknown user')) : placeholder;

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" aria-expanded={open} className="w-56 justify-between font-normal">
            <span className={cn('truncate', !value && 'text-muted-foreground')}>{label}</span>
            <ChevronsUpDown className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Search name or email…" value={search} onValueChange={setSearch} />
            <CommandList>
              {users.isFetching && !users.data ? (
                <div className="flex justify-center p-4">
                  <Spinner />
                </div>
              ) : (
                <CommandEmpty>{users.isError ? 'Could not load users' : 'No users found'}</CommandEmpty>
              )}
              <CommandGroup>
                {(users.data?.items ?? []).map((user) => (
                  <CommandItem
                    key={user.id}
                    value={user.id}
                    onSelect={() => {
                      onChange({ id: user.id, email: user.email, name: user.name });
                      setOpen(false);
                    }}
                  >
                    <UserOption user={user} selected={user.id === value} />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value ? (
        <Button variant="ghost" size="icon-sm" aria-label="Clear user" onClick={() => onChange(null)}>
          <X />
        </Button>
      ) : null}
    </div>
  );
}

/** Multi user picker; keeps picked users (with labels) in the parent. */
export function UserMultiPicker({
  value,
  onChange,
  invalid,
}: {
  value: PickedUser[];
  onChange: (users: PickedUser[]) => void;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { search, setSearch, users } = useUserSearch(open);
  const ids = new Set(value.map((u) => u.id));

  const toggle = (user: AdminUserListItem) => {
    if (ids.has(user.id)) onChange(value.filter((u) => u.id !== user.id));
    else onChange([...value, { id: user.id, email: user.email, name: user.name }]);
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-invalid={invalid}
            className="w-full justify-between font-normal"
          >
            <span className="text-muted-foreground">
              {value.length ? `${value.length} user${value.length > 1 ? 's' : ''} selected` : 'Search users to add…'}
            </span>
            <ChevronsUpDown className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Search name or email…" value={search} onValueChange={setSearch} />
            <CommandList>
              <CommandEmpty>{users.isFetching ? 'Searching…' : 'No users found'}</CommandEmpty>
              <CommandGroup>
                {(users.data?.items ?? []).map((user) => (
                  <CommandItem key={user.id} value={user.id} onSelect={() => toggle(user)}>
                    <UserOption user={user} selected={ids.has(user.id)} />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value.length ? (
        <div className="flex flex-wrap gap-1.5">
          {value.map((user) => (
            <Badge key={user.id} variant="secondary" className="gap-1 pr-1">
              {user.email}
              <button
                type="button"
                className="rounded-sm p-0.5 hover:bg-foreground/10"
                aria-label={`Remove ${user.email}`}
                onClick={() => onChange(value.filter((u) => u.id !== user.id))}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}
