"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";
import type { ThemeMode } from "@/lib/api/types";

export function ThemeProvider({ defaultMode, children }: { defaultMode: ThemeMode; children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme={defaultMode}
      enableSystem
      disableTransitionOnChange
      storageKey="remi-theme"
    >
      {children}
    </NextThemesProvider>
  );
}
