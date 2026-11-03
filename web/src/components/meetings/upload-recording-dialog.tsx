"use client";

import { FileAudio, UploadCloud, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Field } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useUploadMeeting } from "@/hooks/queries/use-meetings";
import { getErrorMessage } from "@/lib/api/errors";
import { fromLocalInputValue } from "@/lib/format";
import { reportHref } from "@/lib/routes";
import { cn } from "@/lib/utils";

// Mirrors the API contract: audio ≤ 200 MB (mp3, m4a, wav, webm, ogg) or transcript ≤ 5 MB (txt, vtt, srt).
const AUDIO_EXT = ["mp3", "m4a", "wav", "webm", "ogg"];
const TRANSCRIPT_EXT = ["txt", "vtt", "srt"];
const MB = 1024 * 1024;
const AUDIO_MAX = 200 * MB;
const TRANSCRIPT_MAX = 5 * MB;
// Browsers report inconsistent MIME types (or none), so the type is only rejected when clearly wrong.
const AUDIO_MIME = /^(audio\/|video\/webm$|video\/ogg$|application\/ogg$)/;
const TRANSCRIPT_MIME = /^(text\/|application\/x-subrip$|application\/octet-stream$)/;

function validate(file: File): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (file.size === 0) return "That file is empty.";
  if (AUDIO_EXT.includes(ext)) {
    if (file.type && !AUDIO_MIME.test(file.type) && file.type !== "application/octet-stream") return "That doesn't look like an audio file.";
    return file.size > AUDIO_MAX ? `Audio files must be 200 MB or smaller (this one is ${formatBytes(file.size)}).` : null;
  }
  if (TRANSCRIPT_EXT.includes(ext)) {
    if (file.type && !TRANSCRIPT_MIME.test(file.type)) return "That doesn't look like a text transcript.";
    return file.size > TRANSCRIPT_MAX ? `Transcripts must be 5 MB or smaller (this one is ${formatBytes(file.size)}).` : null;
  }
  return `Unsupported file type. Use ${[...AUDIO_EXT, ...TRANSCRIPT_EXT].join(", ")}.`;
}

function formatBytes(bytes: number) {
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function UploadRecordingDialog({ trigger }: { trigger?: ReactNode }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [startAt, setStartAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const upload = useUploadMeeting();

  const reset = () => {
    setFile(null);
    setTitle("");
    setStartAt("");
    setError(null);
    setProgress(0);
  };

  const pick = (f: File | undefined) => {
    if (!f) return;
    const problem = validate(f);
    setError(problem);
    setFile(problem ? null : f);
    if (!problem && !title) setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    pick(e.dataTransfer.files?.[0]);
  };

  const submit = () => {
    if (!file) {
      setError("Choose a recording or transcript to upload.");
      return;
    }
    if (!title.trim()) {
      setError("Give the meeting a title.");
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    upload.mutate(
      {
        input: { file, title: title.trim(), startAt: fromLocalInputValue(startAt) ?? undefined },
        options: { onProgress: setProgress, signal: controller.signal },
      },
      {
        onSuccess: (meeting) => {
          toast.success("Upload complete", { description: "We're transcribing and writing your report." });
          setOpen(false);
          reset();
          router.push(reportHref(meeting.id));
        },
        onError: (err) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setError(getErrorMessage(err));
        },
      },
    );
  };

  const onOpenChange = (next: boolean) => {
    if (!next && upload.isPending) abortRef.current?.abort();
    setOpen(next);
    if (!next) reset();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline">
            <UploadCloud /> Upload recording
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload a recording</DialogTitle>
          <DialogDescription>
            Audio (mp3, m4a, wav, webm, ogg · up to 200 MB) or a transcript (txt, vtt, srt · up to 5 MB).
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {file ? (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3">
              <span className="grid size-10 place-items-center rounded-md bg-brand-soft text-primary">
                <FileAudio className="size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{file.name}</span>
                <span className="block text-xs text-muted-foreground">{formatBytes(file.size)}</span>
              </span>
              {!upload.isPending && (
                <Button variant="ghost" size="icon-sm" aria-label="Remove file" onClick={() => setFile(null)}>
                  <X />
                </Button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                "flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors hover:border-primary/50 hover:bg-brand-soft/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                dragging && "border-primary bg-brand-soft/60",
              )}
            >
              <UploadCloud className="size-8 text-primary" aria-hidden="true" />
              <span className="text-sm font-medium">Drop a file here or click to browse</span>
              <span className="text-xs text-muted-foreground">We&apos;ll transcribe it and write the report</span>
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            accept={[...AUDIO_EXT, ...TRANSCRIPT_EXT].map((e) => `.${e}`).join(",")}
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <Field id="upload-title" label="Title">
            <Input id="upload-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Customer call with Acme" />
          </Field>
          <Field id="upload-start" label="When did it happen?" hint="Optional — defaults to now">
            <Input id="upload-start" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
          </Field>
          {upload.isPending && (
            <div className="grid gap-1.5" aria-live="polite">
              <Progress value={Math.round(progress * 100)} aria-label="Upload progress" />
              <p className="text-xs text-muted-foreground">
                {progress < 1 ? `Uploading… ${Math.round(progress * 100)}%` : "Processing upload…"}
              </p>
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {upload.isPending ? "Cancel upload" : "Cancel"}
          </Button>
          <Button onClick={submit} disabled={upload.isPending || !file}>
            {upload.isPending ? "Uploading…" : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
