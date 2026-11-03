import { Upload, Video } from "lucide-react";
import type { MeetingPlatform, MeetingSource } from "@/lib/api/types";
import { PLATFORM_LABEL } from "@/lib/meeting";
import { cn } from "@/lib/utils";

export function PlatformBadge({
  platform,
  source,
  className,
}: {
  platform: MeetingPlatform;
  source?: MeetingSource;
  className?: string;
}) {
  if (source === "upload") {
    return (
      <span className={cn("inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground", className)}>
        <Upload className="size-3" aria-hidden="true" /> Upload
      </span>
    );
  }
  const isMeet = platform === "google_meet";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
        isMeet ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground",
        className,
      )}
    >
      <Video className="size-3" aria-hidden="true" /> {PLATFORM_LABEL[platform] ?? "Other"}
    </span>
  );
}
