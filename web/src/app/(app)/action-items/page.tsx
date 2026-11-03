import type { Metadata } from "next";
import { ActionItemsView } from "@/components/action-items/action-items-view";

export const metadata: Metadata = { title: "Action items" };

export default function ActionItemsPage() {
  return <ActionItemsView />;
}
