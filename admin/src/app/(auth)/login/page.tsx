import type { Metadata } from 'next';
import { AudioLines } from 'lucide-react';
import { Suspense } from 'react';

import { Skeleton } from '@/components/ui/skeleton';

import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <AudioLines className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Remi Admin</h1>
            <p className="text-sm text-muted-foreground">Sign in to manage the website and app</p>
          </div>
        </div>
        <Suspense fallback={<Skeleton className="h-72 w-full rounded-xl" />}>
          <LoginForm />
        </Suspense>
        <p className="text-center text-xs text-muted-foreground">
          Admin accounts are created by a super admin. The first account comes from ADMIN_SEED_EMAIL on the API.
        </p>
      </div>
    </div>
  );
}
