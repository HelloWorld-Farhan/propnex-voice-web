"use client";

import { useState, useEffect, useRef } from "react";
import { PhoneIncoming, RefreshCcw, AlertCircle, Phone } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { CallLogTable } from "@/components/tables/call-log-table";
import { TablePagination } from "@/components/tables/table-pagination";
import { EmptyState } from "@/components/common/empty-state";
import { InboundFilters } from "@/features/inbound/components/inbound-filters";
import { TranscriptDrawer } from "@/components/common/transcript-drawer";
import { useInboundCallsApi } from "@/features/inbound/hooks/use-inbound-calls-api";
import { useUserContext } from "@/features/auth/context/user-context";
import {
  DEFAULT_CALL_FILTERS,
  type CallLogFilters,
  type CallRecord,
} from "@/types/call";

// ─── Skeleton loader ──────────────────────────────────────────────────────────
function TableSkeleton() {
  return (
    <div className="rounded-xl border border-border overflow-hidden animate-pulse">
      <div className="bg-muted/40 h-12 w-full" />
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          className="h-14 w-full bg-background border-t border-border flex items-center gap-4 px-4"
        >
          <div className="h-4 w-24 rounded bg-muted" />
          <div className="h-4 w-32 rounded bg-muted" />
          <div className="h-4 w-20 rounded bg-muted flex-1" />
          <div className="h-6 w-20 rounded-full bg-muted" />
          <div className="h-4 w-16 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

// ─── Error banner ─────────────────────────────────────────────────────────────
function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      <div className="flex items-center gap-2">
        <AlertCircle className="size-4 shrink-0" />
        <span>{message}</span>
      </div>
      <button
        onClick={onRetry}
        className="flex items-center gap-1.5 rounded-md border border-destructive/30 px-3 py-1 text-xs font-medium hover:bg-destructive/10 transition-colors"
      >
        <RefreshCcw className="size-3" />
        Retry
      </button>
    </div>
  );
}

// ─── Live call elapsed timer ──────────────────────────────────────────────────
function LiveCallTimer({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = new Date(startedAt).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  return <span className="font-mono font-semibold">{m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${String(s).padStart(2, "0")}s`}</span>;
}

// ─── Active Call Banner ───────────────────────────────────────────────────────
function ActiveCallBanner({ calls }: { calls: CallRecord[] }) {
  const seenLive = new Set<string>();
  const liveCalls = calls.filter((c) => {
    if (c.status !== "ringing" && c.status !== "answered") return false;
    const custCore = c.customerNumber.replace(/\D/g, "").slice(-10);
    const didCore = c.assignedNumber.replace(/\D/g, "").slice(-10);
    const key = `${custCore}_${didCore}`;
    if (seenLive.has(key)) return false;
    seenLive.add(key);
    return true;
  });
  if (liveCalls.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3"
      >
        {liveCalls.map((call) => (
          <div key={call.id} className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5">
              {/* Pulsing dot */}
              <span className="relative flex size-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full size-3 bg-emerald-500" />
              </span>
              <Phone className="size-4 text-emerald-400" />
              <span className="text-sm font-semibold text-emerald-300">
                {call.status === "ringing" ? "📞 Ringing…" : "🟢 Active Call"}
              </span>
              <span className="text-sm text-muted-foreground">
                from <span className="text-foreground font-mono">{call.customerNumber}</span>
                {" → "}<span className="text-foreground font-mono">{call.assignedNumber}</span>
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-emerald-400">
              {call.status === "ringing" ? (
                <span className="animate-pulse text-yellow-400 font-medium">Ringing…</span>
              ) : call.liveStartedAt ? (
                <LiveCallTimer startedAt={call.liveStartedAt} />
              ) : null}
            </div>
          </div>
        ))}
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export function InboundPageContent() {
  const [filters, setFilters] = useState<CallLogFilters>(DEFAULT_CALL_FILTERS);
  const handleFiltersChange = (next: CallLogFilters) => {
    setFilters(next);
    setPage(1);
  };
  const handleResetFilters = () => {
    setFilters(DEFAULT_CALL_FILTERS);
    setPage(1);
  };

  const { user } = useUserContext();
  const [page, setPage] = useState(1);
  const [retryKey, setRetryKey] = useState(0);

  const {
    calls,
    total,
    totalPages,
    loading,
    isChangingPage,
    error,
  } = useInboundCallsApi(filters, page, retryKey, true, user?.companyId, "inbound");

  const pageSize = 8;

  const [selectedCall, setSelectedCall] = useState<CallRecord | null>(null);
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  const handleViewTranscript = (call: CallRecord) => {
    setSelectedCall(call);
    setTranscriptOpen(true);
  };

  const handleRetry = () => {
    setRetryKey(k => k + 1);
  };

  const hasLiveCalls = calls.some(
    (c) => c.status === "ringing" || c.status === "answered"
  );

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-1"
      >
        <div className="flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-lg bg-muted">
            <PhoneIncoming className="size-5 text-foreground" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Inbound Calls</h2>
            <p className="text-sm text-muted-foreground">
              {error
                ? "Could not load calls from server"
                : total > 0
                  ? `${total.toLocaleString()} incoming call${total === 1 ? "" : "s"} found`
                  : "Incoming calls handled for this sub-company"}
            </p>
          </div>
        </div>
      </motion.div>

      {/* ── Active call live banner (Page 1 only) ── */}
      {page === 1 && <ActiveCallBanner calls={calls} />}

      {/* ── Filters ── */}
      <InboundFilters
        filters={filters}
        onChange={handleFiltersChange}
        onReset={handleResetFilters}
        loading={loading}
      />

      {/* ── Error ── */}
      {error && !loading && (
        <ErrorBanner message={error} onRetry={handleRetry} />
      )}

      {/* ── Content ── */}
      {loading && calls.length === 0 ? (
        <TableSkeleton />
      ) : calls.length === 0 && !error ? (
        <EmptyState
          title="No inbound calls yet"
          description="Call records for this sub-company will appear here once available."
        />
      ) : !error ? (
        <>
          <CallLogTable
            calls={calls}
            variant="inbound"
            onViewTranscript={handleViewTranscript}
            isChangingPage={isChangingPage}
          />
          <TablePagination
            page={page}
            totalPages={totalPages}
            totalItems={total}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        </>
      ) : null}

      {/* ── Transcript drawer ── */}
      <TranscriptDrawer
        call={selectedCall}
        open={transcriptOpen}
        onOpenChange={setTranscriptOpen}
      />
    </div>
  );
}
