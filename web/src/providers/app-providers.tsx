"use client";

import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { PublicConfig } from "@/lib/api/types";
import { ConfigProvider } from "./config-provider";
import { QueryProvider } from "./query-provider";
import { ThemeProvider } from "./theme-provider";

export function AppProviders({ config, children }: { config: PublicConfig; children: ReactNode }) {
  return (
    <ConfigProvider config={config}>
      <ThemeProvider defaultMode={config.theme.defaultMode}>
        <QueryProvider>
          <TooltipProvider delayDuration={200}>
            {children}
            <Toaster position="bottom-right" richColors closeButton />
          </TooltipProvider>
        </QueryProvider>
      </ThemeProvider>
    </ConfigProvider>
  );
}
