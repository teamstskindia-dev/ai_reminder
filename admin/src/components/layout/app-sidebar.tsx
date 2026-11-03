'use client';

import { AudioLines } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useAdminSession } from '@/components/auth/admin-session';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';
import { ROLE_LABELS } from '@/lib/roles';

import { isNavActive, NAV_GROUPS } from './nav-config';

function SidebarBrand() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" asChild>
          <Link href="/">
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <AudioLines className="size-4" />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">Remi Admin</span>
              <span className="truncate text-xs text-muted-foreground">Control panel</span>
            </div>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export function SidebarNav() {
  const pathname = usePathname();
  const { can, isLoading } = useAdminSession();
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <>
      {NAV_GROUPS.map((group) => {
        const items = group.items.filter((item) => !item.minRole || can(item.minRole));
        if (items.length === 0 && !isLoading) return null;
        return (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={isNavActive(pathname, item)} tooltip={item.title}>
                      <Link href={item.href} onClick={() => isMobile && setOpenMobile(false)}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        );
      })}
    </>
  );
}

export function SidebarNavFallback() {
  return (
    <SidebarGroup>
      <SidebarMenu>
        {Array.from({ length: 10 }, (_, i) => (
          <SidebarMenuItem key={i}>
            <SidebarMenuSkeleton showIcon width={`${55 + ((i * 17) % 35)}%`} />
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}

function SidebarAccount() {
  const { admin } = useAdminSession();
  if (!admin) return null;
  return (
    <div className="px-2 pb-1 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
      Signed in as <span className="font-medium text-sidebar-foreground">{admin.name}</span>
      <br />
      {ROLE_LABELS[admin.role]}
    </div>
  );
}

export function AppSidebar({ nav }: { nav: React.ReactNode }) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarBrand />
      </SidebarHeader>
      <SidebarContent>{nav}</SidebarContent>
      <SidebarFooter>
        <SidebarAccount />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
