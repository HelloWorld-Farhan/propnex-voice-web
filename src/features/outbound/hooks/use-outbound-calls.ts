"use client";

import { useState, useEffect, useCallback } from "react";
import { DEFAULT_CALL_FILTERS, type CallLogFilters, type CallRecord } from "@/types/call";
import { useUserContext } from "@/features/auth/context/user-context";

const OUTBOUND_PAGE_SIZE = 8;

export function useOutboundCalls() {
  const { user } = useUserContext();
  const [filters, setFilters] = useState<CallLogFilters>(DEFAULT_CALL_FILTERS);

  const [page, setPage] = useState(1);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [totalCalls, setTotalCalls] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  // Start as false — set to true only when we actually begin fetching so the UI
  // never gets permanently stuck in "Loading outgoing calls…" if the user context
  // takes a moment to hydrate or if the early-guard fires.
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCalls = useCallback(async (isBackground = false) => {
    if (!user?.companyId) {
      // User context not ready yet — make sure we are NOT stuck in loading state
      setLoading(false);
      return;
    }

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

      // Prevent unnecessary re-renders: skip state update if background poll returns identical data
      setCalls((prev) => {
        const prevSig = prev
          .map((c: any) => `${c.id || c.callId}_${c.status}_${c.durationSeconds}_${c.recordingUrl}`)
          .join(",");
        const nextSig = newCalls
          .map((c: any) => `${c.id || c.callId}_${c.status}_${c.durationSeconds}_${c.recordingUrl}`)
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

    // Background polling every 5 s for near real-time updates
    const id = setInterval(() => {
      fetchCalls(true);
    }, 5000);

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
