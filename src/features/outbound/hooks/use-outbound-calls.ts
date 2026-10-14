"use client";

import { useState, useEffect, useCallback } from "react";
import { DEFAULT_CALL_FILTERS, type CallLogFilters, type CallRecord } from "@/types/call";
import { useUserContext } from "@/features/auth/context/user-context";

const OUTBOUND_PAGE_SIZE = 8;

export function useOutboundCalls() {
  const { user } = useUserContext();
  const [filters, setFilters] = useState<CallLogFilters>(DEFAULT_CALL_FILTERS);

  const [page, setPage] = useState(1);
  const [calls, setCalls] = useState<CallRecord[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem("propnex_outbound_calls_cache");
        if (cached) return JSON.parse(cached);
      } catch {}
    }
    return [];
  });
  const [totalCalls, setTotalCalls] = useState<number>(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem("propnex_outbound_total_cache");
        if (cached) return parseInt(cached, 10) || 0;
      } catch {}
    }
    return 0;
  });
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCalls = useCallback(async (isBackground = false) => {
    if (!user?.companyId) {
      setLoading(false);
      return;
    }

    // On manual navigation (page change, filter change), indicate loading immediately
    if (!isBackground) {
      setLoading(true);
    }

    setError(null);
    try {
      const query = new URLSearchParams();
      query.set("page", page.toString());
      query.set("limit", OUTBOUND_PAGE_SIZE.toString());
      query.set("companyId", user.companyId);

      if (filters.status && filters.status !== "all") query.set("status", filters.status.toUpperCase());
      if (filters.assignedNumber) query.set("assignedNumber", filters.assignedNumber);
      if (filters.callerNumber) query.set("callerNumber", filters.callerNumber);
      if (filters.dateFrom) query.set("dateFrom", filters.dateFrom);
      if (filters.dateTo) query.set("dateTo", filters.dateTo);
      if (filters.search) query.set("search", filters.search);
      if (filters.minDuration) {
        query.set("minDuration", filters.minDuration);
        query.set("durationUnit", filters.durationUnit || "sec");
      }
      if (filters.sortBy) query.set("sortBy", filters.sortBy);
      if (filters.sortOrder) query.set("sortOrder", filters.sortOrder);

      const token = localStorage.getItem("accessToken") || localStorage.getItem("access_token") || "";
      const res = await fetch(`/api/calls/outbound?${query.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to fetch calls");
      const data = await res.json();

      const newCalls = data.data || [];
      const newTotal = data.meta?.total || 0;
      const newPages = data.meta?.totalPages || 1;

      // Cache primary page results in localStorage so subsequent opens render instantly
      if (page === 1 && (!filters.status || filters.status === "all") && !filters.search && !filters.callerNumber && !filters.assignedNumber) {
        try {
          localStorage.setItem("propnex_outbound_calls_cache", JSON.stringify(newCalls));
          localStorage.setItem("propnex_outbound_total_cache", newTotal.toString());
        } catch {}
      }

      // Prevent unnecessary re-renders: skip state update if background poll returns identical data
      setCalls((prev) => {
        const prevSig = prev
          .map((c: any) => `${c.id || c.callId}_${c.status}_${c.durationSeconds}_${c.creditsUsed}_${c.recordingUrl}`)
          .join(",");
        const nextSig = newCalls
          .map((c: any) => `${c.id || c.callId}_${c.status}_${c.durationSeconds}_${c.creditsUsed}_${c.recordingUrl}`)
          .join(",");
        if (isBackground && prevSig === nextSig) {
          return prev;
        }
        return newCalls;
      });
      setTotalCalls((prev) => (prev === newTotal ? prev : newTotal));
      setTotalPages((prev) => (prev === newPages ? prev : newPages));
    } catch (err: any) {
      setError(err.message);
    } finally {
      if (!isBackground) {
        setLoading(false);
      }
    }
  }, [page, filters, user?.companyId]);

  // Immediately clear loading when user context becomes available (or is still absent)
  // so we never stay stuck at "Loading outgoing calls…"
  useEffect(() => {
    if (!user?.companyId) {
      setLoading(false);
    }
  }, [user?.companyId]);

  useEffect(() => {
    fetchCalls(false);

    // Background polling every 2 s for seamless real-time updates
    const id = setInterval(() => {
      fetchCalls(true);
    }, 2000);

    return () => clearInterval(id);
  }, [fetchCalls]);

  return {
    filters,
    updateFilters: (next: CallLogFilters) => { setFilters(next); setPage(1); },
    resetFilters: () => { setFilters(DEFAULT_CALL_FILTERS); setPage(1); },
    calls,
    totalCalls,
    page,
    totalPages,
    pageSize: OUTBOUND_PAGE_SIZE,
    setPage,
    loading,
    error,
    handleRetry: fetchCalls,
  };
}
