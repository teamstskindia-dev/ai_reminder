"use client";

import { Bell, ChevronsUpDown, LogOut, Monitor, Moon, Settings, Sun } from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { UserAvatar } from "@/components/common/user-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLogout, useSession } from "@/hooks/queries/use-session";
import { cn } from "@/lib/utils";

function MenuItems() {
  const { data } = useSession();
  const logout = useLogout();
  const { theme, setTheme } = useTheme();
  const user = data?.user;

  return (
    <>
      <DropdownMenuLabel className="flex items-center gap-3 py-2 font-normal">
        <UserAvatar name={user?.name} email={user?.email} src={user?.avatarUrl} className="size-9" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{user?.name || user?.email}</p>
          <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
        </div>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings /> Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/notifications">
            <Bell /> Notifications
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Sun className="dark:hidden" />
            <Moon className="hidden dark:block" />
            Theme
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
              <DropdownMenuRadioItem value="light">
                <Sun /> Light
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                <Moon /> Dark
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                <Monitor /> System
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" disabled={logout.isPending} onSelect={() => logout.mutate()}>
        <LogOut /> Sign out
      </DropdownMenuItem>
    </>
  );
}

/** Sidebar footer variant: avatar, name and plan. */
export function SidebarUserMenu() {
  const { data } = useSession();
  const user = data?.user;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex w-full items-center gap-3 rounded-[var(--radius)] p-2 text-left transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none data-[state=open]:bg-sidebar-accent"
        aria-label="Account menu"
      >
        <UserAvatar name={user?.name} email={user?.email} src={user?.avatarUrl} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{user?.name || user?.email || "Account"}</p>
          <p className="truncate text-xs text-sidebar-foreground/60">{user?.plan?.name ? `${user.plan.name} plan` : "Free plan"}</p>
        </div>
        <ChevronsUpDown className="size-4 shrink-0 text-sidebar-foreground/50" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-60">
        <MenuItems />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Top-bar variant: avatar only. */
export function TopbarUserMenu({ className }: { className?: string }) {
  const { data } = useSession();
  const user = data?.user;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn("rounded-full focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none", className)}
        aria-label="Account menu"
      >
        <UserAvatar name={user?.name} email={user?.email} src={user?.avatarUrl} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <MenuItems />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
