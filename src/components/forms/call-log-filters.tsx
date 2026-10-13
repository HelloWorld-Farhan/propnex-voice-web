"use client";

import { useState, useEffect, memo } from "react";
import {
  RotateCcw,
  Search,
  Calendar,
  Clock,
  PhoneCall,
  User,
  Activity,
  SlidersHorizontal,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CALL_STATUS_OPTIONS,
  DEFAULT_CALL_FILTERS,
  type CallLogFilters,
} from "@/types/call";
import { cn } from "@/lib/utils";

type CallLogFiltersBarProps = {
  filters: CallLogFilters;
  onChange: (filters: CallLogFilters) => void;
  onReset: () => void;
  searchId?: string;
  className?: string;
  hideAssignedNumber?: boolean;
  loading?: boolean;
};

export const CallLogFiltersBar = memo(function CallLogFiltersBar({
  filters,
  onChange,
  onReset,
  searchId = "call-log-search",
  className,
  hideAssignedNumber = false,
  loading = false,
}: CallLogFiltersBarProps) {
  const [localFilters, setLocalFilters] = useState<CallLogFilters>(filters);

  // Sync only when actual filter values differ to prevent wiping input state or re-rendering
  useEffect(() => {
    setLocalFilters((prev) => {
      const isSame =
        prev.search === filters.search &&
        prev.status === filters.status &&
        prev.dateFrom === filters.dateFrom &&
        prev.dateTo === filters.dateTo &&
        prev.assignedNumber === filters.assignedNumber &&
        prev.callerNumber === filters.callerNumber &&
        prev.minDuration === filters.minDuration &&
        prev.durationUnit === filters.durationUnit;
      return isSame ? prev : filters;
    });
  }, [filters]);

  const update = (patch: Partial<CallLogFilters>) => {
    setLocalFilters((prev) => ({ ...prev, ...patch }));
  };

  const updateImmediate = (patch: Partial<CallLogFilters>) => {
    const next = { ...localFilters, ...patch };
    setLocalFilters(next);
    onChange(next);
  };

  const handleSearch = () => {
    onChange(localFilters);
  };

  const activeCount = [
    Boolean(localFilters.search && localFilters.search !== DEFAULT_CALL_FILTERS.search),
    Boolean(localFilters.status && localFilters.status !== "all"),
    Boolean(localFilters.dateFrom && localFilters.dateFrom !== DEFAULT_CALL_FILTERS.dateFrom),
    Boolean(localFilters.dateTo && localFilters.dateTo !== DEFAULT_CALL_FILTERS.dateTo),
    Boolean(localFilters.assignedNumber && localFilters.assignedNumber !== DEFAULT_CALL_FILTERS.assignedNumber),
    Boolean(localFilters.callerNumber && localFilters.callerNumber !== DEFAULT_CALL_FILTERS.callerNumber),
    Boolean(localFilters.minDuration && localFilters.minDuration !== DEFAULT_CALL_FILTERS.minDuration),
  ].filter(Boolean).length;

  const handleReset = () => {
    const clean: CallLogFilters = {
      ...DEFAULT_CALL_FILTERS,
      sortBy: "date",
      sortOrder: "desc",
    };
    setLocalFilters(clean);
    onChange(clean);
    onReset();
  };

  return (
    <div
      className={cn(
        "rounded-2xl border border-border/60 bg-card/60 p-5 shadow-sm backdrop-blur-md transition-all",
        className
      )}
    >
      {/* Header bar */}
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-border/40 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
            <SlidersHorizontal className="size-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">Filters</h3>
              {activeCount > 0 && (
                <span className="inline-flex items-center rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary border border-primary/25">
                  {activeCount} active
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground hidden sm:block">
              Filter calls by number, status, date range, or duration
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={handleReset}
            >
              <RotateCcw className="size-3.5" />
              <span>Reset</span>
            </Button>
          )}
          <Button
            variant="default"
            size="sm"
            className="h-8 gap-1.5 px-3.5 text-xs font-medium shadow-xs"
            onClick={handleSearch}
          >
            <Search className="size-3.5" />
            <span>Search</span>
          </Button>
        </div>
      </div>

      {/* Structured filter grid */}
      <div className="space-y-4">
        {/* Row 1: Identification & Status */}
        <div
          className={cn(
            "grid gap-4 grid-cols-1",
            hideAssignedNumber
              ? "sm:grid-cols-2"
              : "sm:grid-cols-2 lg:grid-cols-3"
          )}
        >
          {!hideAssignedNumber && (
            <div className="space-y-1.5">
              <label
                htmlFor={`${searchId}-assigned`}
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
              >
                <PhoneCall className="size-3.5 text-muted-foreground/80" />
                <span>Assigned number</span>
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id={`${searchId}-assigned`}
                  placeholder="Filter assigned DID..."
                  value={localFilters.assignedNumber}
                  onChange={(e) => update({ assignedNumber: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSearch();
                  }}
                  className="pl-9 h-9.5 text-sm"
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor={`${searchId}-caller`}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
            >
              <User className="size-3.5 text-muted-foreground/80" />
              <span>Customer number</span>
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id={`${searchId}-caller`}
                placeholder="Filter customer number..."
                value={localFilters.callerNumber}
                onChange={(e) => update({ callerNumber: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSearch();
                }}
                className="pl-9 h-9.5 text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor={`${searchId}-status`}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
            >
              <Activity className="size-3.5 text-muted-foreground/80" />
              <span>Status</span>
            </label>
            <select
              id={`${searchId}-status`}
              value={localFilters.status}
              onChange={(e) =>
                updateImmediate({
                  status: e.target.value as CallLogFilters["status"],
                })
              }
              className="flex h-9.5 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground transition-colors [color-scheme:dark] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {CALL_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 2: Date Range & Duration */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 pt-1 border-t border-border/20">
          <div className="space-y-1.5">
            <label
              htmlFor={`${searchId}-from`}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
            >
              <Calendar className="size-3.5 text-muted-foreground/80" />
              <span>Date from</span>
            </label>
            <Input
              id={`${searchId}-from`}
              type="date"
              value={localFilters.dateFrom}
              onChange={(e) => update({ dateFrom: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearch();
              }}
              className="h-9.5 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor={`${searchId}-to`}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
            >
              <Calendar className="size-3.5 text-muted-foreground/80" />
              <span>Date to</span>
            </label>
            <Input
              id={`${searchId}-to`}
              type="date"
              value={localFilters.dateTo}
              onChange={(e) => update({ dateTo: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearch();
              }}
              className="h-9.5 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor={`${searchId}-duration`}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
            >
              <Clock className="size-3.5 text-muted-foreground/80" />
              <span>Min Duration</span>
            </label>
            <div className="flex gap-2">
              <Input
                id={`${searchId}-duration`}
                type="number"
                min="0"
                step="any"
                placeholder="e.g. 5"
                value={localFilters.minDuration}
                onChange={(e) => update({ minDuration: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSearch();
                }}
                className="flex-1 h-9.5 text-sm"
              />
              <select
                id={`${searchId}-unit`}
                value={localFilters.durationUnit}
                onChange={(e) =>
                  updateImmediate({
                    durationUnit: e.target.value as "sec" | "min",
                  })
                }
                className="w-24 shrink-0 rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground transition-colors [color-scheme:dark] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring h-9.5"
              >
                <option value="sec">Seconds</option>
                <option value="min">Minutes</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
