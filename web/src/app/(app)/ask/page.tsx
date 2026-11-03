import type { Metadata } from "next";
import { AskView } from "@/components/ask/ask-view";

export const metadata: Metadata = { title: "Ask AI" };

export default function AskPage() {
  return <AskView />;
}
