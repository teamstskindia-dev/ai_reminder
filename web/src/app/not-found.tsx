import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-1 flex-col items-center justify-center gap-6 px-4 text-center">
      <Link href="/" aria-label="Home">
        <Logo />
      </Link>
      <div className="space-y-2">
        <p className="text-sm font-medium text-primary">404</p>
        <h1 className="text-3xl font-semibold tracking-tight">Page not found</h1>
        <p className="max-w-md text-muted-foreground">
          The page you are looking for doesn&apos;t exist or has been moved.
        </p>
      </div>
      <Button asChild>
        <Link href="/">Back to home</Link>
      </Button>
    </main>
  );
}
