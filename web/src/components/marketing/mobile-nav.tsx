"use client";

import { Menu } from "lucide-react";
import { useState } from "react";
import { Logo } from "@/components/brand/logo";
import { SmartLink } from "@/components/common/smart-link";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { NavItem } from "@/lib/api/types";

export function MobileNav({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-lg" className="md:hidden" aria-label="Open menu">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[85vw] max-w-sm">
        <SheetHeader>
          <SheetTitle>
            <Logo />
          </SheetTitle>
          <SheetDescription className="sr-only">Site navigation</SheetDescription>
        </SheetHeader>
        <nav aria-label="Mobile" className="flex flex-col gap-1 px-4">
          {items.map((item) => (
            <SmartLink
              key={item.id}
              href={item.href}
              external={item.isExternal}
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-2.5 text-base font-medium text-foreground/80 hover:bg-muted hover:text-foreground"
            >
              {item.label}
            </SmartLink>
          ))}
          <SmartLink
            href="/login"
            onClick={() => setOpen(false)}
            className="mt-2 rounded-md px-3 py-2.5 text-base font-medium text-primary hover:bg-muted"
          >
            Sign in
          </SmartLink>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
