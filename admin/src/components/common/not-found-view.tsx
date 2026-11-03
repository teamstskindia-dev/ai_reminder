import { FileQuestion, Home, LayoutTemplate, Users } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';

/** Shared 404 body (inside the admin shell for unknown admin URLs, standalone at the root). */
export function NotFoundView() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <FileQuestion className="size-6 text-muted-foreground" aria-hidden />
      </div>
      <div className="space-y-1.5">
        <p className="font-mono text-xs text-muted-foreground">404</p>
        <h1 className="text-xl font-semibold">Page not found</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          This admin page does not exist, or the item it pointed to was deleted.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link href="/">
            <Home /> Dashboard
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/users">
            <Users /> Users
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/content/sections">
            <LayoutTemplate /> Landing & sections
          </Link>
        </Button>
      </div>
    </div>
  );
}
