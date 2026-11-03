'use client';

import { CloudOff } from 'lucide-react';
import { Suspense, type ReactNode } from 'react';

import { useAdminSession } from '@/components/auth/admin-session';
import { getErrorMessage } from '@/lib/api/errors';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';

import { AdminMenu } from './admin-menu';
import { AppSidebar, SidebarNav, SidebarNavFallback } from './app-sidebar';
import { BreadcrumbProvider } from './breadcrumb-context';
import { Breadcrumbs } from './breadcrumbs';
import { PageSkeleton } from './page-skeleton';
import { ThemeToggle } from './theme-toggle';

function ApiUnavailableBanner() {
  const { error, refetch } = useAdminSession();
  if (!error || (error.code !== 'NETWORK_ERROR' && error.status < 500)) return null;
  return (
    <Alert variant="destructive" className="mb-4">
      <CloudOff />
      <AlertTitle>API unavailable</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-3">
        <span>{getErrorMessage(error)}</span>
        <Button size="sm" variant="outline" onClick={refetch}>
          Retry
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <BreadcrumbProvider>
      <SidebarProvider>
        <AppSidebar
          nav={
            <Suspense fallback={<SidebarNavFallback />}>
              <SidebarNav />
            </Suspense>
          }
        />
        <SidebarInset className="min-w-0">
          <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
            <div className="min-w-0 flex-1">
              <Suspense fallback={<Skeleton className="h-4 w-40" />}>
                <Breadcrumbs />
              </Suspense>
            </div>
            <ThemeToggle />
            <AdminMenu />
          </header>
          <main className="flex-1 px-4 py-6 md:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-7xl">
              <ApiUnavailableBanner />
              <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
            </div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </BreadcrumbProvider>
  );
}
