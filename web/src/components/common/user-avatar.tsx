import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/format";
import { safeImageUrl } from "@/lib/safe-url";
import { cn } from "@/lib/utils";

export function UserAvatar({
  name,
  email,
  src,
  className,
}: {
  name: string | null | undefined;
  email?: string | null;
  src?: string | null;
  className?: string;
}) {
  const safeSrc = safeImageUrl(src);
  return (
    <Avatar className={cn("size-8", className)}>
      {safeSrc && <AvatarImage src={safeSrc} alt="" referrerPolicy="no-referrer" />}
      <AvatarFallback className="bg-brand-soft text-xs font-semibold text-brand-soft-foreground">
        {initials(name, email)}
      </AvatarFallback>
    </Avatar>
  );
}
