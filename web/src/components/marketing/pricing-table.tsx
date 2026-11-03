"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Plan } from "@/lib/api/types";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

type Cycle = "monthly" | "yearly";

function yearlySavingsPercent(plans: Plan[]): number {
  let best = 0;
  for (const plan of plans) {
    if (plan.priceMonthly > 0 && plan.priceYearly > 0) {
      const saving = 1 - plan.priceYearly / (plan.priceMonthly * 12);
      best = Math.max(best, saving);
    }
  }
  return Math.round(best * 100);
}

function PlanCard({ plan, cycle }: { plan: Plan; cycle: Cycle }) {
  const isFree = plan.priceMonthly === 0 && plan.priceYearly === 0;
  const perMonth = cycle === "yearly" ? plan.priceYearly / 12 : plan.priceMonthly;
  const price = formatPrice(Math.round(perMonth * 100) / 100, plan.currency);

  return (
    <div
      className={cn(
        "relative flex flex-col gap-6 rounded-[calc(var(--radius)*1.8)] border bg-card p-7 shadow-sm",
        plan.isPopular && "border-primary/60 shadow-xl ring-1 shadow-primary/10 ring-primary/40 lg:-my-3 lg:py-10",
      )}
    >
      {plan.isPopular && (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 shadow-sm">Most popular</Badge>
      )}
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">{plan.name}</h3>
        {plan.description && <p className="text-sm text-muted-foreground">{plan.description}</p>}
      </div>
      <div className="space-y-1">
        <p className="flex items-baseline gap-1">
          <span className="text-4xl font-semibold tracking-tight">{price}</span>
          {!isFree && <span className="text-sm text-muted-foreground">/ month</span>}
        </p>
        <p className="h-5 text-xs text-muted-foreground">
          {isFree
            ? "Free forever"
            : cycle === "yearly"
              ? `${formatPrice(plan.priceYearly, plan.currency)} billed yearly`
              : "Billed monthly"}
        </p>
      </div>
      <Button asChild size="lg" variant={plan.isPopular ? "default" : "outline"} className="h-10 w-full">
        <Link href="/login">{plan.ctaLabel || "Get started"}</Link>
      </Button>
      {plan.features.length > 0 && (
        <ul className="space-y-3 border-t pt-6">
          {plan.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2.5 text-sm">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PricingTable({ plans }: { plans: Plan[] }) {
  const [cycle, setCycle] = useState<Cycle>("monthly");
  const savings = yearlySavingsPercent(plans);
  const hasYearly = plans.some((p) => p.priceYearly > 0);

  if (plans.length === 0) {
    return <p className="mt-10 text-center text-muted-foreground">Plans are coming soon.</p>;
  }

  return (
    <div className="mt-10 space-y-10">
      {hasYearly && (
        <div className="flex justify-center">
          <div role="radiogroup" aria-label="Billing cycle" className="inline-flex items-center rounded-full border bg-muted/60 p-1">
            {(["monthly", "yearly"] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={cycle === value}
                onClick={() => setCycle(value)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  cycle === value && "bg-background text-foreground shadow-sm",
                )}
              >
                {value === "monthly" ? "Monthly" : "Yearly"}
                {value === "yearly" && savings > 0 && (
                  <span className="rounded-full bg-brand-accent/15 px-2 py-0.5 text-xs font-semibold text-brand-accent">
                    Save {savings}%
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
      <div
        className={cn(
          "mx-auto grid max-w-6xl items-stretch gap-6",
          plans.length === 1 && "max-w-md",
          plans.length === 2 && "max-w-3xl md:grid-cols-2",
          plans.length >= 3 && "md:grid-cols-2 lg:grid-cols-3",
        )}
      >
        {plans.map((plan) => (
          <PlanCard key={plan.id} plan={plan} cycle={cycle} />
        ))}
      </div>
    </div>
  );
}
