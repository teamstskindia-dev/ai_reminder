import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { SmartLink } from "@/components/common/smart-link";
import type { NavItem } from "@/lib/api/types";
import { getCurrentYear, getPublicConfig } from "@/lib/config/server";
import { ThemeToggle } from "./theme-toggle";

function groupFooter(items: NavItem[]): { label: string; items: NavItem[] }[] {
  const groups = new Map<string, NavItem[]>();
  for (const item of items) {
    const key = item.groupLabel?.trim() || "Links";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()].map(([label, groupItems]) => ({ label, items: groupItems }));
}

export async function SiteFooter() {
  const [{ navigation, branding }, year] = await Promise.all([getPublicConfig(), getCurrentYear()]);
  const groups = groupFooter(navigation.footer);

  return (
    <footer className="border-t bg-surface">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.3fr_2fr] lg:px-8">
        <div className="space-y-4">
          <Link href="/" className="inline-flex" aria-label={`${branding.appName} home`}>
            <Logo />
          </Link>
          <p className="max-w-xs text-sm text-muted-foreground">{branding.tagline}</p>
          {branding.supportEmail && (
            <SmartLink href={`mailto:${branding.supportEmail}`} className="text-sm font-medium text-primary hover:underline">
              {branding.supportEmail}
            </SmartLink>
          )}
        </div>
        {groups.length > 0 && (
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {groups.map((group) => (
              <div key={group.label} className="space-y-3">
                <p className="text-sm font-semibold">{group.label}</p>
                <ul className="space-y-2">
                  {group.items.map((item) => (
                    <li key={item.id}>
                      <SmartLink
                        href={item.href}
                        external={item.isExternal}
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {item.label}
                      </SmartLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="border-t">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
          <p>
            © {year} {branding.companyName || branding.appName}. All rights reserved.
          </p>
          <ThemeToggle />
        </div>
      </div>
    </footer>
  );
}
