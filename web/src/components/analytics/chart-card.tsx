"use client";

import { BarChart3, Table2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface TableColumn<Row> {
  header: string;
  cell: (row: Row) => ReactNode;
  align?: "left" | "right";
}

/** Card with a chart and an accessible table view of the same data. */
export function ChartCard<Row>({
  title,
  description,
  children,
  rows,
  columns,
  empty,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  rows: Row[];
  columns: TableColumn<Row>[];
  /** Rendered instead of the chart when there's nothing to show. */
  empty?: ReactNode;
  className?: string;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <section className={cn("flex flex-col rounded-xl border bg-card shadow-xs", className)}>
      <header className="flex items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        {!empty && (
          <div role="radiogroup" aria-label={`${title} view`} className="flex shrink-0 rounded-md border p-0.5">
            {(["chart", "table"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={view === v}
                aria-label={v === "chart" ? "Chart view" : "Table view"}
                onClick={() => setView(v)}
                className={cn(
                  "grid size-6 place-items-center rounded text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                  view === v && "bg-muted text-foreground",
                )}
              >
                {v === "chart" ? <BarChart3 className="size-3.5" /> : <Table2 className="size-3.5" />}
              </button>
            ))}
          </div>
        )}
      </header>
      <div className="flex-1 px-5 pt-3 pb-5">
        {empty ? (
          empty
        ) : view === "chart" ? (
          children
        ) : (
          <div className="max-h-72 overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                <tr>
                  {columns.map((c) => (
                    <th key={c.header} className={cn("px-3 py-2 font-medium text-muted-foreground", c.align === "right" ? "text-right" : "text-left")}>
                      {c.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row, i) => (
                  <tr key={i}>
                    {columns.map((c) => (
                      <td key={c.header} className={cn("px-3 py-1.5 tabular-nums", c.align === "right" && "text-right")}>
                        {c.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

export function ChartEmpty({ message = "No meetings in this period yet." }: { message?: string }) {
  return (
    <div className="grid h-56 place-items-center rounded-lg border border-dashed text-center text-sm text-muted-foreground">
      <p className="max-w-56">{message}</p>
    </div>
  );
}
