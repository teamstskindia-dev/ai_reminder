import { cn } from "@/lib/utils";

export function TopicChips({ topics, max = 3, className }: { topics: string[]; max?: number; className?: string }) {
  if (!topics?.length) return null;
  const shown = topics.slice(0, max);
  const extra = topics.length - shown.length;
  return (
    <span className={cn("flex flex-wrap items-center gap-1", className)}>
      {shown.map((topic) => (
        <span key={topic} className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand-soft-foreground">
          {topic}
        </span>
      ))}
      {extra > 0 && <span className="text-[11px] text-muted-foreground">+{extra}</span>}
    </span>
  );
}
