"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { SmartLink } from "@/components/common/smart-link";
import { DynamicIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useNavigation } from "@/providers/config-provider";
import { SidebarUserMenu } from "./user-menu";

function isActive(pathname: string, href: string, allHrefs: string[]) {
  if (pathname === href) return true;
  if (!pathname.startsWith(`${href}/`)) return false;
  // Prefer the most specific matching item (e.g. /analytics/reports vs /analytics).
  return !allHrefs.some((other) => other !== href && other.startsWith(href) && pathname.startsWith(other));
}

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const items = useNavigation("sidebar");
  const pathname = usePathname();
  const hrefs = items.map((i) => i.href);

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 shrink-0 items-center px-5">
        <Link href="/dashboard" onClick={onNavigate} className="rounded-md focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none">
          <Logo variant="onDark" />
        </Link>
      </div>
      <nav aria-label="App" className="scrollbar-thin flex-1 overflow-y-auto px-3 py-2">
        <ul className="space-y-0.5">
          {items.map((item) => {
            const active = !item.isExternal && isActive(pathname, item.href, hrefs);
            return (
              <li key={item.id}>
                <SmartLink
                  href={item.href}
                  external={item.isExternal}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-[var(--radius)] px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none",
                    active && "bg-sidebar-accent text-sidebar-foreground",
                  )}
                >
                  {active && (
                    <span aria-hidden="true" className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-full bg-sidebar-primary" />
                  )}
                  <DynamicIcon
                    icon={item.icon}
                    className={cn("size-[18px] shrink-0", active ? "text-sidebar-primary" : "text-sidebar-foreground/60 group-hover:text-sidebar-foreground")}
                  />
                  <span className="truncate">{item.label}</span>
                </SmartLink>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="border-t border-sidebar-border p-3">
        <SidebarUserMenu />
      </div>
    </div>
  );
}

export function AppSidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-sidebar-border md:block">
      <SidebarContent />
    </aside>
  );
}
