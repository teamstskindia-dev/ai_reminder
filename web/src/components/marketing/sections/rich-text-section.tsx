import { Markdown } from "@/components/common/markdown";
import type { SectionContent } from "@/lib/api/types";
import { SectionShell } from "./section-shell";

export function RichTextSection({ content }: { content: SectionContent["rich_text"] }) {
  if (!content.markdown) return null;
  return (
    <SectionShell innerClassName="max-w-3xl">
      <Markdown size="lg">{content.markdown}</Markdown>
    </SectionShell>
  );
}
