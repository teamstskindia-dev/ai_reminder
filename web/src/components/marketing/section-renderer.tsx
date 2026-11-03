import type { AnySection } from "@/lib/api/types";
import { CtaSection } from "./sections/cta-section";
import { FaqSection } from "./sections/faq-section";
import { FeaturesSection } from "./sections/features-section";
import { HeroSection } from "./sections/hero-section";
import { LogosSection } from "./sections/logos-section";
import { PricingSection } from "./sections/pricing-section";
import { RichTextSection } from "./sections/rich-text-section";
import { StatsSection } from "./sections/stats-section";
import { StepsSection } from "./sections/steps-section";
import { TestimonialsSection } from "./sections/testimonials-section";

/** Maps every contract `SectionType` to its component. Unknown types render nothing. */
function renderSection(section: AnySection) {
  switch (section.type) {
    case "hero":
      return <HeroSection content={section.content} />;
    case "logos":
      return <LogosSection content={section.content} />;
    case "features":
      return <FeaturesSection content={section.content} />;
    case "steps":
      return <StepsSection content={section.content} />;
    case "stats":
      return <StatsSection content={section.content} />;
    case "testimonials":
      return <TestimonialsSection content={section.content} />;
    case "pricing":
      return <PricingSection content={section.content} />;
    case "faq":
      return <FaqSection content={section.content} />;
    case "cta":
      return <CtaSection content={section.content} />;
    case "rich_text":
      return <RichTextSection content={section.content} />;
    case "onboarding_slide":
      return null; // mobile-only
    default:
      return null;
  }
}

export function SectionRenderer({ sections }: { sections: AnySection[] }) {
  return (
    <>
      {sections.map((section) => (
        <div key={section.id} data-section-type={section.type}>
          {renderSection(section)}
        </div>
      ))}
    </>
  );
}
