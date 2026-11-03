"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore, type ReactNode } from "react";
import { ErrorState } from "@/components/common/states";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/hooks/queries/use-session";
import { useIsClient } from "@/hooks/use-is-client";
import { isApiError } from "@/lib/api/errors";
import { maintenanceStore } from "@/lib/maintenance";
import { featureForPath } from "@/lib/routes";
import { useConfig } from "@/providers/config-provider";
import { RealtimeProvider } from "@/providers/realtime-provider";
import { AppSidebar } from "./app-sidebar";
import { AppTopbar } from "./app-topbar";
import { FeatureDisabled } from "./feature-disabled";
import { MaintenanceScreen } from "./maintenance-screen";

/** Static frame rendered on the server / before hydration (signed-in pages are client-rendered). */
export function AppShellSkeleton() {
  return (
    <div className="flex min-h-svh flex-1 bg-surface" aria-busy="true">
      <div className="fixed inset-y-0 left-0 hidden w-60 border-r border-sidebar-border bg-sidebar md:block" />
      <div className="flex min-w-0 flex-1 flex-col md:pl-60">
        <div className="h-16 border-b bg-background" />
        <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
          <Skeleton className="h-8 w-56" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

function ShellContent({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const config = useConfig();
  const session = useSession();
  const maintenance = useSyncExternalStore(
    maintenanceStore.subscribe,
    maintenanceStore.getSnapshot,
    maintenanceStore.getServerSnapshot,
  );

  if (maintenance || config.app.maintenanceMode) return <MaintenanceScreen />;

  // A 401 triggers the refresh/redirect flow in the API client; keep the skeleton meanwhile.
  if (session.isPending || (session.isError && isApiError(session.error) && session.error.status === 401)) {
    return <AppShellSkeleton />;
  }

  if (session.isError) {
    return (
      <div className="flex min-h-svh flex-1 items-center justify-center bg-surface px-4">
        <div className="w-full max-w-md rounded-xl border bg-card">
          <ErrorState error={session.error} title="We couldn't load your account" onRetry={() => session.refetch()} />
        </div>
      </div>
    );
  }

  const gated = featureForPath(pathname);
  const disabled = gated && !config.features[gated.feature];

  return (
    <RealtimeProvider enabled>
      <div className="flex min-h-svh flex-1 bg-surface">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col md:pl-60">
          <AppTopbar />
          <main id="main" className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
            <div className="mx-auto w-full max-w-7xl">{disabled ? <FeatureDisabled label={gated.label} /> : children}</div>
          </main>
        </div>
      </div>
    </RealtimeProvider>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const isClient = useIsClient();
  if (!isClient) return <AppShellSkeleton />;
  return <ShellContent>{children}</ShellContent>;
}
