"use client";

import { FileText, Phone } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { RecordingPlayer } from "@/components/common/recording-player";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import type { CallRecord } from "@/types/call";
import { cn } from "@/lib/utils";
import { formatDisplayNumber, calculateTelephonyCredits } from "@/lib/telephony-utils";

type CallLogTableProps = {
  calls: CallRecord[];
  onViewTranscript: (call: CallRecord) => void;
  variant?: "inbound" | "outbound";
  className?: string;
  isChangingPage?: boolean;
};

function formatCallDate(iso: string) {
  return new Intl.DateTimeFormat("en-SG", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false,
  }).format(new Date(iso));
}

/** Counts up from the call start time, refreshing every second */
function LiveDuration({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = new Date(startedAt).getTime();
    const tick = () => {
      // Clamp to 0 to completely prevent negative numbers from clock skew
      setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
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
  isChangingPage = false,
}: CallLogTableProps) {
  const [accurateDurations, setAccurateDurations] = useState<Record<string, number>>({});
  const syncedCallsRef = useRef<Set<string>>(new Set());

  const handleDurationLoaded = (callId: string, realSec: number) => {
    setAccurateDurations((prev) => {
      if (prev[callId] === realSec) return prev;
      return { ...prev, [callId]: realSec };
    });

    if (syncedCallsRef.current.has(callId)) return;
    syncedCallsRef.current.add(callId);

    // Quietly sync with server database once
    fetch("/api/calls/sync-duration", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId, durationSeconds: realSec }),
    }).catch(() => {});
  };

  return (
    <div className={cn("glass-card relative overflow-hidden rounded-2xl transition-all duration-200", className)}>
      {isChangingPage && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary/30 via-primary to-primary/30 animate-pulse z-20" />
      )}
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
          <tbody className={cn("transition-opacity duration-150", isChangingPage && "opacity-70")}>
            <AnimatePresence mode="popLayout" initial={false}>
              {calls.map((call, index) => {
                const normStatus = (call.status || "").toLowerCase().trim();
                const isLiveAnswered = (normStatus === "answered" || normStatus === "in-progress" || normStatus === "active") && Boolean(call.liveStartedAt);
                const isRinging = normStatus === "ringing" || normStatus === "pending" || normStatus === "dispatching";
                const isLive = isLiveAnswered || isRinging;
                const realDurationSec = accurateDurations[call.id] ?? call.durationSeconds ?? 0;
                const effMins = Math.floor(realDurationSec / 60);
                const effSecs = realDurationSec % 60;
                const formattedDuration = isLiveAnswered ? (
                  <LiveDuration startedAt={call.liveStartedAt!} />
                ) : isRinging ? (
                  <span className="font-mono text-sm text-muted-foreground">00s</span>
                ) : realDurationSec > 0 ? (
                  effMins > 0 ? `${effMins}m ${effSecs}s` : `${effSecs}s`
                ) : (
                  <span className="font-mono text-sm text-muted-foreground">00s</span>
                );

                // 1.75 credits per 30-second block for outbound completed calls
                const calculatedCredits = realDurationSec > 0
                  ? calculateTelephonyCredits(realDurationSec)
                  : (call.creditsUsed || 0);

                const isCompletedOrRecorded = call.status?.toLowerCase() === "completed" || Boolean(call.recordingUrl);
                const displayCredits = isLive ? (
                  <span className="text-xs text-muted-foreground">—</span>
                ) : (call.creditsUsed && call.creditsUsed > 0 && !accurateDurations[call.id]) ? (
                  call.creditsUsed % 1 === 0 ? call.creditsUsed : call.creditsUsed.toFixed(2)
                ) : isCompletedOrRecorded && realDurationSec > 0 ? (
                  calculatedCredits % 1 === 0 ? calculatedCredits : calculatedCredits.toFixed(2)
                ) : (
                  call.creditsUsed || 0
                );

                const customerFormatted = formatDisplayNumber(call.customerNumber);
                const assignedFormatted = formatDisplayNumber(call.assignedNumber);

                return (
                  <motion.tr
                    key={call.id}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.16, delay: Math.min(index * 0.02, 0.12), ease: "easeOut" }}
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
                            "text-purple-400 font-semibold"
                          )}>
                            {call.callType === "internal" ? "Internal" : call.callType}
                          </span>
                        )}
                        <span>
                          {customerFormatted || <span className="opacity-40">—</span>}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-sm">
                      {assignedFormatted ? (
                        assignedFormatted
                      ) : (
                        <span className="opacity-40">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {formatCallDate(call.callDateTime)}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {formattedDuration}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={call.status} />
                    </td>
                    <td className="px-4 py-3">
                      {call.recordingUrl ? (
                        <RecordingPlayer
                          durationSeconds={realDurationSec > 0 ? realDurationSec : call.durationSeconds}
                          audioUrl={call.recordingUrl}
                          compact
                          onDurationChange={(sec) => handleDurationLoaded(call.id, sec)}
                        />
                      ) : isLive ? (
                        <span className="text-xs text-emerald-500 font-medium">In progress…</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Not found</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const isViewable = !isLive && Boolean(
                          call.status === "completed" ||
                          call.recordingUrl ||
                          call.transcriptUrl ||
                          (call.transcript && call.transcript.length > 0)
                        );
                        return (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1.5 text-xs text-foreground/80 hover:text-foreground hover:bg-muted"
                            disabled={!isViewable}
                            onClick={() => onViewTranscript(call)}
                          >
                            <FileText className="size-3.5" />
                            View
                          </Button>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-foreground">
                      {displayCredits}
                    </td>
                  </motion.tr>
                );
              })}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
    </div>
  );
}
