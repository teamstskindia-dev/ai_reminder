import type { Metadata } from "next";
import { SectionRenderer } from "@/components/marketing/section-renderer";
import { getSections } from "@/lib/config/server";

export async function generateMetadata(): Promise<Metadata> {
  const sections = await getSections("pricing");
  const pricing = sections.find((s) => s.type === "pricing");
  return {
    title: "Pricing",
    description: pricing?.type === "pricing" ? (pricing.content.subtitle ?? undefined) : undefined,
  };
}

export default async function PricingPage() {
  const sections = await getSections("pricing");
  return (
    <div className="pt-4">
      <SectionRenderer sections={sections} />
    </div>
  );
}
