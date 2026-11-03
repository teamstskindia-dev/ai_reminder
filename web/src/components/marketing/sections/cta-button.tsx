import { ArrowRight } from "lucide-react";
import { SmartLink } from "@/components/common/smart-link";
import { Button } from "@/components/ui/button";
import type { Cta } from "@/lib/api/types";
import { cn } from "@/lib/utils";

export function CtaButton({
  cta,
  variant = "default",
  className,
  arrow = false,
}: {
  cta: Cta | null | undefined;
  variant?: "default" | "outline" | "secondary" | "ghost";
  className?: string;
  arrow?: boolean;
}) {
  if (!cta?.label || !cta.href) return null;
  return (
    <Button asChild size="lg" variant={variant} className={cn("h-11 px-5 text-[0.95rem]", className)}>
      <SmartLink href={cta.href}>
        {cta.label}
        {arrow && <ArrowRight data-icon="inline-end" aria-hidden="true" />}
      </SmartLink>
    </Button>
  );
}
