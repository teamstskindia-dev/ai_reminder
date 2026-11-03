import type { Metadata } from "next";
import { ReportDetailView } from "@/components/meetings/report/report-detail-view";

export const metadata: Metadata = { title: "Meeting report" };

export default function ReportDetailPage() {
  return <ReportDetailView />;
}
