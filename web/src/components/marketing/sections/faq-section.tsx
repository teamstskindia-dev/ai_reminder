import type { SectionContent } from "@/lib/api/types";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { SectionShell } from "./section-shell";

export function FaqSection({ content }: { content: SectionContent["faq"] }) {
  return (
    <SectionShell id="faq">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr] lg:gap-16">
        <div className="space-y-3">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{content.title}</h2>
        </div>
        <Accordion type="single" collapsible className="w-full">
          {content.items?.map((item, index) => (
            <AccordionItem key={item.question} value={`faq-${index}`}>
              <AccordionTrigger className="py-5 text-base font-medium">{item.question}</AccordionTrigger>
              <AccordionContent className="text-base leading-relaxed text-muted-foreground">{item.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </SectionShell>
  );
}
