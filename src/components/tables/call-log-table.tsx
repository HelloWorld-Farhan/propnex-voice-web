"use client";

import { FileText, Phone } from "lucide-react";
import { useState, useEffect } from "react";

import { RecordingPlayer } from "@/components/common/recording-player";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import type { CallRecord } from "@/types/call";
import { cn } from "@/lib/utils";

type CallLogTableProps = {
  calls: CallRecord[];
  onViewTranscript: (call: CallRecord) => void;
  variant?: "inbound" | "outbound";
  className?: string;
};

function formatCallDate(iso: string) {
  return new Intl.DateTimeFormat("en-SG", {
    dateStyle: "medium",
    timeStyle: "short", hour12: false,
  }).format(new Date(iso));
}

function getCallId(call: CallRecord) {
  if (call.callId) return call.callId;
  return call.id.toUpperCase().replace(/^IN-/, "INB-").replace(/^OUT-/, "OUT-");
}

/** Counts up from the call start time, refreshing every second */
function LiveDuration({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = new Date(startedAt).getTime();
    const tick = () => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  return (
    <span className="inline-flex items-center gap-1 font-mono text-sm text-emerald-500 font-semibold">
      <Phone className="size-3 animate-pulse" />
      {m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${String(s).padStart(2, "0")}s`}
    </span>
  );
}

export function CallLogTable({
  calls,
  onViewTranscript,
  variant = "outbound",
  className,
}: CallLogTableProps) {
  const isInbound = variant === "inbound";

  return (
    <div className={cn("glass-card overflow-hidden rounded-2xl", className)}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="border-b border-border bg-white/5">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Customer Number
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Assigned Number
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Call Date/Time
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Duration
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Status
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Recording
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Transcription
              </th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                Credits
              </th>
            </tr>
          </thead>
          <tbody>
            {calls.map((call) => {
              const isLive = call.status === "answered" || call.status === "in-progress";
              return (
                <tr
                  key={call.id}
                  className={cn(
                    "border-b border-border/60 transition-colors last:border-0 hover:bg-white/5",
                    isLive && "bg-emerald-500/5"
                  )}
                >
                  <td className="px-4 py-3 font-medium">
                    <div className="flex flex-col">
                      {call.callType && (
                        <span className={cn(
                          "text-[9px] uppercase font-bold tracking-wider",
                          call.callType === "campaign" ? "text-fuchsia-500/80" :
                          call.callType === "lead" ? "text-emerald-500/80" :
                          "text-blue-500/80"
                        )}>
                          {call.callType === "internal" ? "Internal" : call.callType}
                        </span>
                      )}
                      <span>
                        {call.customerNumber?.startsWith('+') ? call.customerNumber : `+91${call.customerNumber?.replace(/^[0]+/, '') || ''}`}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-sm">
                    {call.assignedNumber ? (call.assignedNumber.startsWith('+') ? call.assignedNumber : `+91${call.assignedNumber.replace(/^[0]+/, '')}`) : <span className="opacity-40">—</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {formatCallDate(call.callDateTime)}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {isLive && call.liveStartedAt ? (
                      <LiveDuration startedAt={call.liveStartedAt} />
                    ) : (
                      call.duration
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={call.status} />
                  </td>
                  <td className="px-4 py-3">
                    {call.recordingUrl ? (
                      <RecordingPlayer
                        durationSeconds={call.durationSeconds}
                        audioUrl={call.recordingUrl}
                        compact
                      />
                    ) : isLive ? (
                      <span className="text-xs text-emerald-500 font-medium">In progress…</span>
                    ) : call.status === "completed" ? (
                      <span className="text-xs text-muted-foreground">Not found</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                      disabled={!call.transcriptUrl || isLive}
                      onClick={() => onViewTranscript(call)}
                    >
                      <FileText className="size-3.5" />
                      View
                    </Button>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-foreground">
                    {isLive ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      call.creditsUsed
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
