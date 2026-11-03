'use client';

import { LogOut, UserCog } from 'lucide-react';
import Link from 'next/link';

import { useAdminSession } from '@/components/auth/admin-session';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { ROLE_LABELS } from '@/lib/roles';
import { initials } from '@/lib/utils';
import { SafeAvatarImage } from '@/components/common/safe-avatar-image';

export function AdminMenu() {
  const { admin, isLoading, logout } = useAdminSession();

  if (isLoading) return <Skeleton className="size-8 rounded-full" />;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account menu">
          <Avatar className="size-8">
            <SafeAvatarImage src={admin?.avatarUrl} />
            <AvatarFallback className="text-xs">{initials(admin?.name ?? admin?.email)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-0.5">
            <span className="truncate text-sm font-medium">{admin?.name ?? 'Not signed in'}</span>
            <span className="truncate text-xs text-muted-foreground">{admin?.email}</span>
            {admin ? (
              <span className="text-xs text-muted-foreground">Role: {ROLE_LABELS[admin.role]}</span>
            ) : null}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profile">
            <UserCog /> Profile & password
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={() => void logout()}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
