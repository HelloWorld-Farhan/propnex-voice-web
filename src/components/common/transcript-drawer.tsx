"use client";

import { FileText, Phone } from "lucide-react";

import { StatusBadge } from "@/components/common/status-badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { CallRecord } from "@/types/call";
import { cn } from "@/lib/utils";

type TranscriptDrawerProps = {
  call: CallRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function formatCallDate(iso: string) {
  return new Intl.DateTimeFormat("en-SG", {
    dateStyle: "medium",
    timeStyle: "short", hour12: false,
  }).format(new Date(iso));
}

import { useEffect, useState } from "react";
import { RecordingPlayer } from "@/components/common/recording-player";

export function TranscriptDrawer({
  call,
  open,
  onOpenChange,
}: TranscriptDrawerProps) {
  const [transcriptData, setTranscriptData] = useState<any[]>(call?.transcript || []);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (call?.transcript && call.transcript.length > 0) {
      setTranscriptData(call.transcript);
    }
  }, [call]);

  useEffect(() => {
    if (open && call) {
      setLoading(true);
      const token = typeof window !== "undefined"
        ? (localStorage.getItem("accessToken") || localStorage.getItem("access_token"))
        : null;

      fetch(`/api/calls/${call.id}/transcript`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then((res) => {
          if (!res.ok) throw new Error("Transcript not found");
          return res.json();
        })
        .then((data) => {
          if (Array.isArray(data)) {
            setTranscriptData(data);
          } else if (data.transcript && Array.isArray(data.transcript)) {
            setTranscriptData(data.transcript);
          } else if (data.messages && Array.isArray(data.messages)) {
            setTranscriptData(data.messages);
          } else if (call?.transcript && call.transcript.length > 0) {
            setTranscriptData(call.transcript);
          } else {
            setTranscriptData([]);
          }
        })
        .catch(() => {
          if (!call?.transcript || call.transcript.length === 0) {
            setTranscriptData([]);
          }
        })
        .finally(() => setLoading(false));
    }
  }, [open, call]);

  if (!call) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-lg">
        <div className="border-b border-border px-6 py-5 pr-14">
          <div className="flex items-center gap-2">
            <FileText className="size-5 text-foreground" />
            <h2 className="text-lg font-semibold">Call Transcript</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {call.customerNumber} · {formatCallDate(call.callDateTime)}
          </p>
        </div>

        <div className="space-y-4 px-6 py-4">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Phone className="size-3.5" />
              {call.assignedNumber}
            </div>
            <StatusBadge status={call.status} />
            <span className="text-muted-foreground">{call.duration}</span>
            <span className="text-muted-foreground">{call.creditsUsed} credits</span>
          </div>
          <Separator />
            <div className="flex flex-col gap-3 py-2">
              {call.recordingUrl && (
                <div className="rounded-xl border border-border bg-card p-3">
                  <RecordingPlayer
                    durationSeconds={call.durationSeconds}
                    audioUrl={call.recordingUrl}
                    label="Call Audio Recording"
                    showCopyUrl={true}
                  />
                </div>
              )}
              {call.transcriptUrl && (
                <a 
                  href={call.transcriptUrl} 
                  target="_blank" 
                  rel="noreferrer" 
                  className="inline-flex w-fit items-center gap-2 text-sm font-medium text-primary hover:underline"
                >
                  <FileText className="size-4" /> 
                  Open Full Transcript Document
                </a>
              )}
              <Separator />
            </div>
        </div>

        <ScrollArea className="flex-1 px-6 pb-6">
          {loading ? (
             <div className="py-12 text-center text-sm text-muted-foreground">Loading transcript...</div>
          ) : transcriptData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="size-10 text-muted-foreground/50" />
              <p className="mt-3 text-sm font-medium">No transcript available</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Transcripts are generated for completed calls only.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {transcriptData.map((line, index) => (
                <div
                  key={`${line.timestamp}-${index}`}
                  className={cn(
                    "rounded-xl border px-4 py-3",
                    line.speaker === "agent"
                      ? "border-border bg-muted"
                      : "border-border bg-card"
                  )}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "text-xs font-semibold uppercase tracking-wider",
                        line.speaker === "agent"
                          ? "text-foreground"
                          : "text-muted-foreground"
                      )}
                    >
                      {line.speaker === "agent" ? "AI Agent" : "Customer"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {line.timestamp}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed">{line.text}</p>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
