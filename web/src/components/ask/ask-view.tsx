"use client";

import { ArrowUp, Menu, MessageSquarePlus, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Markdown } from "@/components/common/markdown";
import { ErrorState } from "@/components/common/states";
import { UserAvatar } from "@/components/common/user-avatar";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useAsk, useAssistantThreads, useDeleteThread, useThreadMessages } from "@/hooks/queries/use-assistant";
import { useMeetings } from "@/hooks/queries/use-meetings";
import { useSession } from "@/hooks/queries/use-session";
import { getErrorInfo, isApiError, type ErrorInfo } from "@/lib/api/errors";
import type { AssistantMessage, AssistantSource } from "@/lib/api/types";
import { formatDate, timeAgo } from "@/lib/format";
import { reportHref } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useBranding } from "@/providers/config-provider";

const STARTERS = [
  "What did I promise to do this week?",
  "Summarize my meetings from yesterday",
  "What decisions did we make about the roadmap?",
  "Which customer concerns came up most recently?",
];

function askErrorCopy(error: unknown): ErrorInfo {
  if (isApiError(error) && error.code === "RATE_LIMITED") {
    return {
      message: error.retryAfter
        ? `You're asking questions faster than we can answer. Try again in ${error.retryAfter} seconds.`
        : "You're asking questions faster than we can answer. Give it a moment and try again.",
    };
  }
  if (isApiError(error) && error.code === "PLAN_LIMIT_REACHED") {
    return {
      message: error.message || "You've reached your plan's Ask AI limit for today.",
      action: { label: "See plans", href: "/pricing" },
    };
  }
  return getErrorInfo(error);
}

function ThreadList({
  activeId,
  onSelect,
  onNew,
}: {
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  const threads = useAssistantThreads();
  const remove = useDeleteThread();
  const [toDelete, setToDelete] = useState<string | null>(null);

  return (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <Button className="w-full justify-start" variant="outline" onClick={onNew}>
          <MessageSquarePlus /> New chat
        </Button>
      </div>
      <nav aria-label="Conversations" className="flex-1 overflow-y-auto px-2 pb-3">
        {threads.isPending ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : threads.isError ? (
          <ErrorState compact error={threads.error} onRetry={() => threads.refetch()} />
        ) : threads.data.items.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">Your conversations will appear here.</p>
        ) : (
          <ul className="space-y-0.5">
            {threads.data.items.map((t) => (
              <li key={t.id} className="group relative">
                <button
                  type="button"
                  onClick={() => onSelect(t.id)}
                  aria-current={activeId === t.id ? "true" : undefined}
                  className={cn(
                    "w-full rounded-md px-3 py-2 pr-9 text-left transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                    activeId === t.id && "bg-accent text-accent-foreground",
                  )}
                >
                  <span className="block truncate text-sm font-medium">{t.title || "Untitled"}</span>
                  <span className="block text-[11px] text-muted-foreground">{timeAgo(t.updatedAt)}</span>
                </button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Delete “${t.title}”`}
                  onClick={() => setToDelete(t.id)}
                  className="absolute top-1/2 right-1.5 -translate-y-1/2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </nav>
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="Delete this conversation?"
        description="The questions and answers in it will be removed."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          const id = toDelete;
          if (!id) return;
          remove.mutate(id, {
            onSuccess: () => {
              toast.success("Conversation deleted");
              if (activeId === id) onNew();
            },
          });
        }}
      />
    </div>
  );
}

function SourceCard({ source, index }: { source: AssistantSource; index: number }) {
  return (
    <Link
      href={reportHref(source.meetingId)}
      className="group flex flex-col gap-1 rounded-lg border bg-background p-3 transition-colors hover:border-primary/40 hover:bg-brand-soft/30"
    >
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="grid size-4 place-items-center rounded bg-muted text-[10px] font-semibold">{index + 1}</span>
        {formatDate(source.startAt)}
      </span>
      <span className="truncate text-sm font-medium group-hover:text-primary">{source.meetingTitle}</span>
      <span className="line-clamp-2 text-xs text-muted-foreground">{source.snippet}</span>
    </Link>
  );
}

function MessageBubble({ message }: { message: Pick<AssistantMessage, "role" | "content" | "sources"> }) {
  const { data } = useSession();
  if (message.role === "user") {
    return (
      <div className="flex justify-end gap-3">
        <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-primary px-4 py-2.5 text-sm whitespace-pre-wrap text-primary-foreground">
          {message.content}
        </div>
        <UserAvatar name={data?.user.name} email={data?.user.email} src={data?.user.avatarUrl} className="hidden sm:flex" />
      </div>
    );
  }
  return (
    <div className="flex gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft text-primary">
        <Sparkles className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        <div className="rounded-2xl rounded-tl-md border bg-card px-4 py-3 shadow-xs">
          <Markdown size="sm">{message.content}</Markdown>
        </div>
        {message.sources.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Sources</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {message.sources.map((s, i) => (
                <SourceCard key={`${s.meetingId}-${i}`} source={s} index={i} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3" role="status" aria-label="Thinking">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft text-primary">
        <Sparkles className="size-4 animate-pulse" aria-hidden="true" />
      </span>
      <div className="flex items-center gap-1 rounded-2xl rounded-tl-md border bg-card px-4 py-3.5">
        {[0, 150, 300].map((delay) => (
          <span key={delay} className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60" style={{ animationDelay: `${delay}ms` }} />
        ))}
      </div>
    </div>
  );
}

export function AskView() {
  const { appName } = useBranding();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [meetingId, setMeetingId] = useState<string>("all");
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [threadsOpen, setThreadsOpen] = useState(false);
  const messages = useThreadMessages(threadId);
  const ask = useAsk();
  const pastMeetings = useMeetings({ scope: "past", status: "completed", limit: 30, page: 1 });
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const list = threadId ? (messages.data ?? []) : [];
  const empty = list.length === 0 && !pending;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [list.length, pending]);

  const send = (text: string) => {
    const question = text.trim();
    if (!question || ask.isPending) return;
    setPending(question);
    setError(null);
    setInput("");
    ask.mutate(
      { question, threadId: threadId ?? undefined, meetingId: meetingId === "all" ? undefined : meetingId },
      {
        onSuccess: (result) => {
          setThreadId(result.threadId);
          setPending(null);
        },
        onError: (e) => {
          setPending(null);
          setError(e);
          setInput(question);
        },
      },
    );
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(input);
    }
  };

  const newChat = () => {
    setThreadId(null);
    setError(null);
    setPending(null);
    setThreadsOpen(false);
    inputRef.current?.focus();
  };

  const selectThread = (id: string) => {
    setThreadId(id);
    setError(null);
    setThreadsOpen(false);
  };

  const errorCopy = error ? askErrorCopy(error) : null;

  return (
    <div className="-mx-4 -my-6 flex h-[calc(100svh-7rem)] sm:mx-0 sm:my-0 sm:h-[calc(100svh-8rem)] sm:overflow-hidden sm:rounded-xl sm:border sm:bg-card sm:shadow-xs">
      <aside className="hidden w-64 shrink-0 border-r bg-muted/20 lg:block">
        <ThreadList activeId={threadId} onSelect={selectThread} onNew={newChat} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col bg-surface sm:bg-card">
        <header className="flex items-center gap-2 border-b px-4 py-2.5">
          <Sheet open={threadsOpen} onOpenChange={setThreadsOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Conversations">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetTitle className="sr-only">Conversations</SheetTitle>
              <SheetDescription className="sr-only">Your Ask AI threads</SheetDescription>
              <div className="h-full pt-10">
                <ThreadList activeId={threadId} onSelect={selectThread} onNew={newChat} />
              </div>
            </SheetContent>
          </Sheet>
          <p className="flex-1 truncate text-sm font-semibold">Ask {appName}</p>
          <Select value={meetingId} onValueChange={setMeetingId}>
            <SelectTrigger size="sm" className="w-44 sm:w-56" aria-label="Scope to a meeting">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="all">All meetings</SelectItem>
              {(pastMeetings.data?.items ?? []).map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  <span className="truncate">{m.title}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
            {threadId && messages.isPending ? (
              <div className="space-y-6">
                <Skeleton className="ml-auto h-10 w-2/3 rounded-2xl" />
                <Skeleton className="h-32 w-5/6 rounded-2xl" />
              </div>
            ) : threadId && messages.isError ? (
              <ErrorState error={messages.error} onRetry={() => messages.refetch()} title="Couldn't load this conversation" />
            ) : empty ? (
              <div className="flex flex-col items-center gap-6 py-10 text-center">
                <span className="grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
                  <Sparkles className="size-7" aria-hidden="true" />
                </span>
                <div className="space-y-2">
                  <h1 className="text-2xl font-semibold tracking-tight">Ask {appName} anything</h1>
                  <p className="mx-auto max-w-md text-sm text-muted-foreground">
                    Search across every meeting — commitments, decisions, what a customer said. Answers come with sources.
                  </p>
                </div>
                <div className="grid w-full max-w-xl gap-2 sm:grid-cols-2">
                  {STARTERS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => send(q)}
                      className="rounded-xl border bg-card px-4 py-3 text-left text-sm transition-colors hover:border-primary/40 hover:bg-brand-soft/30 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              list.map((m) => <MessageBubble key={m.id} message={m} />)
            )}
            {pending && (
              <>
                <MessageBubble message={{ role: "user", content: pending, sources: [] }} />
                <TypingIndicator />
              </>
            )}
            {errorCopy && (
              <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
                <p>{errorCopy.message}</p>
                {errorCopy.reference && <p className="mt-1 text-xs text-muted-foreground">Reference: {errorCopy.reference}</p>}
                {errorCopy.action && (
                  <Link href={errorCopy.action.href} className="mt-1 inline-block font-medium text-primary hover:underline">
                    {errorCopy.action.label}
                  </Link>
                )}
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="border-t bg-card p-3 sm:p-4">
          <form
            className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border bg-background p-2 shadow-xs focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <label htmlFor="ask-input" className="sr-only">
              Ask a question
            </label>
            <textarea
              id="ask-input"
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
              }}
              onKeyDown={onKeyDown}
              placeholder={meetingId === "all" ? "Ask about any meeting…" : "Ask about this meeting…"}
              className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
            />
            <Button type="submit" size="icon" disabled={!input.trim() || ask.isPending} aria-label="Send">
              <ArrowUp />
            </Button>
          </form>
          <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-muted-foreground">
            Answers are generated from your meeting transcripts and can be wrong. Check the sources.
          </p>
        </div>
      </div>
    </div>
  );
}
