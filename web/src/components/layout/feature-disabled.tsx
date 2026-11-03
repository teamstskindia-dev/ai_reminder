import { PowerOff } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";

export function FeatureDisabled({ label }: { label: string }) {
  return (
    <div className="rounded-xl border bg-card">
      <EmptyState
        icon={PowerOff}
        title="This feature is turned off"
        description={`${label} isn't available right now. Your administrator may have disabled it.`}
        action={
          <Button asChild variant="outline">
            <Link href="/dashboard">Back to home</Link>
          </Button>
        }
      />
    </div>
  );
}
