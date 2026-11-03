import { Crown, Users } from "lucide-react";
import { EmptyState } from "@/components/common/states";
import type { Attendee, Participant } from "@/lib/api/types";
import { formatDuration, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { colorFor } from "../attendee-stack";

const BAR_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

export function ParticipantsTab({ participants, attendees }: { participants: Participant[]; attendees: Attendee[] }) {
  const sorted = [...participants].sort((a, b) => b.talkTimeSeconds - a.talkTimeSeconds);
  const totalTalk = sorted.reduce((sum, p) => sum + p.talkTimeSeconds, 0);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <section className="rounded-xl border bg-card p-5 shadow-xs sm:p-6">
        <h3 className="mb-1 text-sm font-semibold">Talk time</h3>
        <p className="mb-5 text-xs text-muted-foreground">Who spoke, and for how long.</p>
        {sorted.length === 0 ? (
          <EmptyState compact icon={Users} title="No speaker data" description="Talk time appears once the transcript is processed." />
        ) : (
          <>
            <div className="mb-6 flex h-3 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label="Talk ratio by participant">
              {sorted.map((p, i) => (
                <div
                  key={p.id}
                  title={`${p.name}: ${Math.round(p.talkRatio)}%`}
                  style={{ width: `${Math.max(p.talkRatio, 0.5)}%`, background: BAR_COLORS[i % BAR_COLORS.length] }}
                />
              ))}
            </div>
            <ul className="space-y-4">
              {sorted.map((p, i) => (
                <li key={p.id} className="grid grid-cols-[2rem_minmax(0,1fr)] items-center gap-3">
                  <span className={cn("grid size-8 place-items-center rounded-full text-xs font-semibold", colorFor(p.name))}>
                    {initials(p.name, p.email)}
                  </span>
                  <div className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate font-medium">{p.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {formatDuration(p.talkTimeSeconds)} · {Math.round(p.talkRatio)}% · {p.wordCount.toLocaleString()} words
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${totalTalk ? (p.talkTimeSeconds / sorted[0].talkTimeSeconds) * 100 : 0}%`,
                          background: BAR_COLORS[i % BAR_COLORS.length],
                        }}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      <section className="rounded-xl border bg-card p-5 shadow-xs sm:p-6">
        <h3 className="mb-4 text-sm font-semibold">Invited ({attendees.length})</h3>
        {attendees.length === 0 ? (
          <p className="text-sm text-muted-foreground">No calendar attendees.</p>
        ) : (
          <ul className="space-y-3">
            {attendees.map((a) => (
              <li key={a.email} className="flex items-center gap-3">
                <span className={cn("grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold", colorFor(a.email))}>
                  {initials(a.name, a.email)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 truncate text-sm font-medium">
                    {a.name || a.email}
                    {a.organizer && <Crown className="size-3.5 shrink-0 text-amber-500" aria-label="Organizer" />}
                  </span>
                  {a.name && <span className="block truncate text-xs text-muted-foreground">{a.email}</span>}
                </span>
                {a.responseStatus && (
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground capitalize">
                    {a.responseStatus.replace(/([A-Z])/g, " $1").toLowerCase()}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
