"use client";

import { useEffect, useState, useMemo, useRef } from "react";

import type { CallLogFilters } from "@/types/call";
import { type CallRecord } from "@/types/call";
import type { CallListApiResponse } from "@/lib/api-client";
import { fetchInboundCalls } from "@/lib/api-client";

// ─── Hook ─────────────────────────────────────────────────────────────────────

type UseInboundCallsApiState = {
  calls: CallRecord[];
  rawCalls?: any[];
  total: number;
  totalPages: number;
  loading: boolean;
  isChangingPage?: boolean;
  error: string | null;
};

const PAGE_SIZE = 8;

function formatDuration(seconds: number): string {
  if (!seconds) return "0s";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function cleanPhone(phone: string): string {
  if (!phone) return "";
  const digitsOnly = phone.replace(/\D/g, "");
  return digitsOnly.replace(/^0+/, "");
}

function mapStatus(raw: string | undefined): CallRecord["status"] {
  const s = (raw ?? "").toLowerCase();
  if (s === "ringing" || s === "dispatching" || s === "queued_at_provider") return "ringing";
  if (s === "answered") return "answered";
  if (s === "completed") return "completed";
  if (s === "failed" || s === "cancelled") return "failed";
  if (s === "missed" || s === "no_answer" || s === "voicemail" || s === "busy") return "missed";
  return "missed";
}

function mapApiItemToCallRecord(item: any, fallbackAssignedNumber: string): CallRecord {
  const pNum = typeof item.phoneNumber === 'string' ? item.phoneNumber : item.phoneNumber?.number;
  
  // Extract caller phone from lead, or fallback to providerWebhook if it's an unknown caller
  let leadPhone = item.lead?.phone;
  if (!leadPhone && item.providerWebhook) {
    if (item.direction === "INBOUND") {
      leadPhone = item.providerWebhook.SourceNumber || item.providerWebhook.source_number || item.providerWebhook.caller;
    } else {
      leadPhone = item.providerWebhook.DestinationNumber || item.providerWebhook.destination_number || item.providerWebhook.did;
    }
  }

  const mappedStatus = mapStatus(item.status);
  const isLive = mappedStatus === "ringing" || mappedStatus === "answered";

  // Extract customer number from all possible sources
  let fallbackCustomerPhone = 
    item.customerNumber ||                                      // Already extracted by API route
    item.providerWebhook?.SourceNumber ||                       // Bonvoice inbound caller
    item.providerWebhook?.phone || 
    item.providerWebhook?.message?.call?.customer?.number || 
    item.providerWebhook?.message?.call?.phoneNumber;

  // Extract assigned DID number from all possible sources  
  let fallbackAssignedRaw = 
    item.assignedNumber ||                                      // Already extracted by API route
    pNum;                                                       // Linked PhoneNumber record

  if (item.providerWebhook?.call) {
    if (item.direction === "INBOUND" || !item.direction) {
      if (!fallbackCustomerPhone) fallbackCustomerPhone = item.providerWebhook.call.from;
      if (!fallbackAssignedRaw) fallbackAssignedRaw = item.providerWebhook.call.to;
    } else if (item.direction === "OUTBOUND") {
      if (!fallbackCustomerPhone) fallbackCustomerPhone = item.providerWebhook.call.to;
      if (!fallbackAssignedRaw) fallbackAssignedRaw = item.providerWebhook.call.from;
    }
  }

  // Bonvoice specific: extract from flat webhook fields
  if (!fallbackCustomerPhone && item.providerWebhook) {
    const wh = item.providerWebhook;
    fallbackCustomerPhone = wh.caller || wh.from_number || wh.customerNumber || wh.customer_number || "";
  }
  if (!fallbackAssignedRaw && item.providerWebhook) {
    const wh = item.providerWebhook;
    // Bonvoice: DisplayNumber = assigned DID, SourceNumber = caller
    fallbackAssignedRaw = wh.DisplayNumber || wh.did_number || wh.DestinationNumber || wh.agentNumber || "";
    // Parse from callID: format uuid-DID-CALLER-DATE-TIME
    if (!fallbackAssignedRaw && wh.callID && typeof wh.callID === 'string') {
      const parts = (wh.callID as string).split('-');
      if (parts.length >= 3) fallbackAssignedRaw = parts[1];
    }
  }

  return {
    id: item.id || item.publicId,
    customerNumber: leadPhone || fallbackCustomerPhone || "Unknown",
    assignedNumber: fallbackAssignedRaw || fallbackAssignedNumber,
    callDateTime: item.callDateTime || item.startedAt || item.createdAt || item.updatedAt || new Date().toISOString(),
    duration: isLive ? "Live" : formatDuration(item.durationSeconds || 0),
    durationSeconds: item.durationSeconds || 0,
    status: mappedStatus,
    creditsUsed: item.creditsUsed || 0,
    recordingUrl: item.recordingUrl || undefined,
    transcriptUrl: item.transcriptUrl || undefined,
    transcript: [],
    liveStartedAt: isLive 
      ? (mappedStatus === "answered" 
          ? (item.updatedAt || new Date().toISOString()) 
          : (item.liveStartedAt || item.callDateTime || item.startedAt || item.createdAt || item.updatedAt || new Date().toISOString())) 
      : undefined,
  };
}

const CACHE_TTL_MS = 30_000; // 30 seconds

const getInboundCache = () => {
  if (typeof window === "undefined") return {};
  try {
    const stored = sessionStorage.getItem("inboundCache");
    if (stored) {
      const parsed = JSON.parse(stored);
      // Evict all expired entries on load
      const now = Date.now();
      Object.keys(parsed).forEach((k) => {
        if (!parsed[k].timestamp || now - parsed[k].timestamp > CACHE_TTL_MS) {
          delete parsed[k];
        }
      });
      return parsed;
    }
  } catch {}
  return {};
};

const inboundCache: Record<string, any> = getInboundCache();

const saveInboundCache = () => {
  if (typeof window !== "undefined") {
    try {
      sessionStorage.setItem("inboundCache", JSON.stringify(inboundCache));
    } catch {}
  }
};

export function useInboundCallsApi(
  filters: CallLogFilters,
  page: number,
  retryKey: number = 0,
  hasAssignedNumber: boolean = true,
  companyId?: string,
  direction?: "inbound" | "outbound"
): UseInboundCallsApiState {
  const { search, status, dateFrom, dateTo, assignedNumber, callerNumber, minDuration, durationUnit, sortBy, sortOrder } = filters;
  const cacheKey = `calls_cache_v5_${direction || "inbound"}_${companyId || "default"}_${page}_${JSON.stringify(filters)}`;

  const currentRequestIdRef = useRef(0);
  const activePageRef = useRef(page);
  activePageRef.current = page;

  const [state, setState] = useState<{
    rawItems: any[];
    rawTotal: number;
    rawTotalPages: number;
    loading: boolean;
    error: string | null;
  }>(() => {
    if (inboundCache[cacheKey]) {
      return {
        rawItems: inboundCache[cacheKey].rawItems,
        rawTotal: inboundCache[cacheKey].rawTotal,
        rawTotalPages: inboundCache[cacheKey].rawTotalPages,
        loading: false,
        error: null
      };
    }
    return {
      rawItems: [],
      rawTotal: 0,
      rawTotalPages: 1,
      loading: true,
      error: null,
    };
  });

  const [isChangingPage, setIsChangingPage] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const thisRequestId = ++currentRequestIdRef.current;
    const requestedPage = page;

    const load = async (isPolling = false) => {
      // Check TTL — if cached data is fresh, skip initial spinner
      const cached = inboundCache[cacheKey];
      const isFresh = cached && (Date.now() - (cached.timestamp || 0)) < CACHE_TTL_MS;

      if (!isPolling) {
        setIsChangingPage(true);
        if (!isFresh) {
          setState((prev) => ({ ...prev, loading: true, error: null }));
        }
      }

      try {
        const res: CallListApiResponse = await fetchInboundCalls({
          status: status !== "all" ? status : undefined,
          page: requestedPage,
          limit: PAGE_SIZE,
          companyId,
          direction: direction === "inbound" ? "INBOUND" : direction === "outbound" ? "OUTBOUND" : undefined,
          search,
          assignedNumber,
          callerNumber,
          dateFrom,
          dateTo,
          minDuration,
          durationUnit,
          sortBy,
          sortOrder,
        });

        // STRICT: Discard stale response if a newer request was issued or page changed in the meantime
        if (isCancelled || thisRequestId !== currentRequestIdRef.current || requestedPage !== activePageRef.current) {
          return;
        }

        setIsChangingPage(false);

        const items = res.data || [];
        const hasLiveCalls = items.some((item: any) => {
          const s = (item.status || "").toLowerCase();
          return s === "ringing" || s === "answered" || s === "queued";
        });

        setState((prev) => {
          // If polling returns identical data on the same page, skip state update to avoid re-renders
          if (isPolling && requestedPage === activePageRef.current) {
            const prevSignature = prev.rawItems
              .map((x: any) => `${x.id || x.callId}_${x.status}_${x.durationSeconds}_${x.recordingUrl}`)
              .join(",");
            const nextSignature = items
              .map((x: any) => `${x.id || x.callId}_${x.status}_${x.durationSeconds}_${x.recordingUrl}`)
              .join(",");
            if (prevSignature === nextSignature && prev.rawTotal === (res.meta?.total || 0)) {
              return prev;
            }
          }
          return {
            rawItems: items,
            rawTotal: res.meta?.total || 0,
            rawTotalPages: res.meta?.totalPages || 1,
            loading: false,
            error: null,
          };
        });

        // Only cache non-live responses to avoid stale live data
        if (!hasLiveCalls) {
          inboundCache[cacheKey] = {
            rawItems: items,
            rawTotal: res.meta?.total || 0,
            rawTotalPages: res.meta?.totalPages || 1,
            timestamp: Date.now()
          };
          saveInboundCache();
        }

        // Single clean interval scheduling
        if (intervalId) clearInterval(intervalId);
        if (!isCancelled && thisRequestId === currentRequestIdRef.current) {
          const pollInterval = hasLiveCalls ? 2000 : 3000;
          intervalId = setInterval(() => {
            if (typeof document !== "undefined" && document.visibilityState === "hidden") {
              return;
            }
            void load(true);
          }, pollInterval);
        }
      } catch (err) {
        if (isCancelled || thisRequestId !== currentRequestIdRef.current) return;
        setIsChangingPage(false);
        const message = err instanceof Error ? err.message : "Failed to load inbound calls";
        setState((prev) => ({
          ...prev,
          loading: false,
          error: message,
        }));
      }
    };

    void load(false);

    return () => {
      isCancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [page, status, retryKey, hasAssignedNumber, companyId, direction, search, assignedNumber, callerNumber, dateFrom, dateTo, minDuration, durationUnit, sortBy, sortOrder, cacheKey]);

  const fallbackAssignedNumber = "Unknown";

  const processedState = useMemo(() => {
    let items = state.rawItems;
    const mapped = items.map((item: any) => mapApiItemToCallRecord(item, fallbackAssignedNumber));

    // Deduplicate calls to guarantee no duplicate rows are rendered
    const seen = new Set<string>();
    const dedupedCalls: CallRecord[] = [];
    for (const call of mapped) {
      const custCore = (call.customerNumber || "").replace(/\D/g, "").slice(-10);
      const didCore = (call.assignedNumber || "").replace(/\D/g, "").slice(-10);
      const timeBucket = call.callDateTime ? Math.floor(new Date(call.callDateTime).getTime() / 15000) : 0;
      const key = `${call.id || ""}_${custCore}_${didCore}_${timeBucket}`;
      const callLogKey = call.callId ? `cl_${call.callId}` : key;
      if (!seen.has(callLogKey)) {
        seen.add(callLogKey);
        dedupedCalls.push(call);
      }
    }

    return {
      calls: dedupedCalls,
      rawCalls: items,
      total: state.rawTotal,
      totalPages: state.rawTotalPages,
      loading: state.loading,
      isChangingPage,
      error: state.error,
    };
  }, [state, isChangingPage]);

  return processedState;
}

export { PAGE_SIZE as INBOUND_API_PAGE_SIZE };
