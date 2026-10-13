"use client";

import { useState, useEffect, useCallback } from "react";
import { DEFAULT_CALL_FILTERS, type CallLogFilters, type CallRecord } from "@/types/call";
import { useUserContext } from "@/features/auth/context/user-context";

const INBOUND_PAGE_SIZE = 8;

export function useInboundCalls() {
  const { user } = useUserContext();
  const [filters, setFilters] = useState<CallLogFilters>(DEFAULT_CALL_FILTERS);
  
  const [page, setPage] = useState(1);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [totalCalls, setTotalCalls] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCalls = useCallback(async (isBackground = false) => {
    if (!user?.companyId) return;
    
    if (!isBackground) {
      setLoading(true);
    }
    
    setError(null);
    try {
      const query = new URLSearchParams();
      query.set("page", page.toString());
      query.set("limit", INBOUND_PAGE_SIZE.toString());
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
      const res = await fetch(`/api/calls/inbound?${query.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to fetch calls");
      const data = await res.json();
      
      setCalls(data.data || []);
      setTotalCalls(data.meta?.total || 0);
      setTotalPages(data.meta?.totalPages || 1);
    } catch (err: any) {
      setError(err.message);
    } finally {
      if (!isBackground) {
        setLoading(false);
      }
    }
  }, [page, filters, user?.companyId]);

  useEffect(() => {
    fetchCalls(false);
    
    // Poll every 5s for live updates without triggering the skeleton loader
    const id = setInterval(() => {
      fetchCalls(true);
    }, 15000); // 15 seconds
    
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
    pageSize: INBOUND_PAGE_SIZE,
    setPage,
    loading,
    error,
    handleRetry: fetchCalls
  };
}
