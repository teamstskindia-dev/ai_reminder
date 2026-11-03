import type { SectionContent } from "@/lib/api/types";
import { getPlans } from "@/lib/config/server";
import { PricingTable } from "../pricing-table";
import { SectionHeading, SectionShell } from "./section-shell";

export async function PricingSection({ content }: { content: SectionContent["pricing"] }) {
  const plans = await getPlans();
  return (
    <SectionShell id="pricing">
      <SectionHeading title={content.title} subtitle={content.subtitle} />
      <PricingTable plans={plans} />
    </SectionShell>
  );
}
