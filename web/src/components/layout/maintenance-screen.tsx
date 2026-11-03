"use client";

import { RotateCcw, Wrench } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { maintenanceStore } from "@/lib/maintenance";
import { useConfig } from "@/providers/config-provider";

export function MaintenanceScreen() {
  const { app, branding } = useConfig();
  return (
    <main className="flex min-h-svh flex-1 flex-col items-center justify-center gap-8 bg-surface px-4 text-center">
      <Logo />
      <div className="flex max-w-md flex-col items-center gap-4">
        <div className="grid size-14 place-items-center rounded-full bg-brand-soft text-primary">
          <Wrench className="size-7" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">We&apos;ll be right back</h1>
        <p className="text-muted-foreground">
          {app.maintenanceMessage || `${branding.appName} is undergoing scheduled maintenance.`}
        </p>
        <Button
          variant="outline"
          onClick={() => {
            maintenanceStore.set(false);
            window.location.reload();
          }}
        >
          <RotateCcw /> Try again
        </Button>
      </div>
    </main>
  );
}
