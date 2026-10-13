"use client";

import { useState, useEffect } from "react";
import { Filter, RotateCcw, Search, Loader2 } from "lucide-react";

import { SelectField } from "@/components/forms/select-field";
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

export function CallLogFiltersBar({
  filters,
  onChange,
  onReset,
  searchId = "call-log-search",
  className,
  hideAssignedNumber = false,
  loading = false,
}: CallLogFiltersBarProps) {
  const [localFilters, setLocalFilters] = useState<CallLogFilters>(filters);

  // Sync with external filters if they reset or change externally
  useEffect(() => {
    setLocalFilters(filters);
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

  const hasActiveFilters =
    filters.search !== DEFAULT_CALL_FILTERS.search ||
    filters.status !== DEFAULT_CALL_FILTERS.status ||
    filters.dateFrom !== DEFAULT_CALL_FILTERS.dateFrom ||
    filters.dateTo !== DEFAULT_CALL_FILTERS.dateTo ||
    filters.assignedNumber !== DEFAULT_CALL_FILTERS.assignedNumber ||
    filters.callerNumber !== DEFAULT_CALL_FILTERS.callerNumber ||
    filters.minDuration !== DEFAULT_CALL_FILTERS.minDuration ||
    filters.durationUnit !== DEFAULT_CALL_FILTERS.durationUnit ||
    filters.sortBy !== DEFAULT_CALL_FILTERS.sortBy ||
    filters.sortOrder !== DEFAULT_CALL_FILTERS.sortOrder;

  return (
    <div className={cn("glass-card rounded-2xl p-4", className)}>
      <div className="mb-4 flex items-center gap-2">
        <Filter className="size-4 text-foreground" />
        <h3 className="text-sm font-semibold">Filters</h3>
        <div className="ml-auto flex items-center gap-2">
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={onReset}
              disabled={loading}
            >
              <RotateCcw className="size-3.5" />
              Reset
            </Button>
          )}
          <Button
            variant="default"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={handleSearch}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Search className="size-3.5" />
            )}
            Search
          </Button>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {!hideAssignedNumber && (
          <div className="space-y-1.5">
            <label
              htmlFor={`${searchId}-assigned`}
              className="text-xs font-medium text-muted-foreground"
            >
              Assigned number
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id={`${searchId}-assigned`}
                placeholder="Filter assigned..."
                value={localFilters.assignedNumber}
                onChange={(e) => update({ assignedNumber: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
                className="pl-10"
                disabled={loading}
              />
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <label
            htmlFor={`${searchId}-caller`}
            className="text-xs font-medium text-muted-foreground"
          >
            Caller number
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id={`${searchId}-caller`}
              placeholder="Filter caller..."
              value={localFilters.callerNumber}
              onChange={(e) => update({ callerNumber: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
              className="pl-10"
              disabled={loading}
            />
          </div>
        </div>

        <SelectField
          label="Status"
          value={localFilters.status}
          onChange={(e) =>
            updateImmediate({
              status: e.target.value as CallLogFilters["status"],
            })
          }
          disabled={loading}
        >
          {CALL_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>

        <div className="space-y-1.5">
          <label
            htmlFor={`${searchId}-from`}
            className="text-xs font-medium text-muted-foreground"
          >
            Date from
          </label>
          <Input
            id={`${searchId}-from`}
            type="date"
            value={localFilters.dateFrom}
            onChange={(e) => update({ dateFrom: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
            disabled={loading}
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor={`${searchId}-to`}
            className="text-xs font-medium text-muted-foreground"
          >
            Date to
          </label>
          <Input
            id={`${searchId}-to`}
            type="date"
            value={localFilters.dateTo}
            onChange={(e) => update({ dateTo: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
            disabled={loading}
          />
        </div>

        <div className="flex gap-2">
          <div className="space-y-1.5 min-w-0 flex-1">
            <label
              htmlFor={`${searchId}-duration`}
              className="text-xs font-medium text-muted-foreground truncate block"
            >
              Min Duration
            </label>
            <Input
              id={`${searchId}-duration`}
              type="number"
              min="0"
              step="any"
              placeholder="e.g. 2"
              value={localFilters.minDuration}
              onChange={(e) => update({ minDuration: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
              disabled={loading}
            />
          </div>
          <SelectField
            label="Unit"
            value={localFilters.durationUnit}
            onChange={(e) =>
              updateImmediate({
                durationUnit: e.target.value as "sec" | "min",
              })
            }
            disabled={loading}
            className="w-[85px] shrink-0"
          >
            <option value="sec">Sec</option>
            <option value="min">Min</option>
          </SelectField>
        </div>

        <SelectField
          label="Sort By"
          value={localFilters.sortBy}
          onChange={(e) =>
            updateImmediate({
              sortBy: e.target.value as "date" | "duration",
            })
          }
          disabled={loading}
        >
          <option value="duration">Call Duration</option>
          <option value="date">Call Date</option>
        </SelectField>

        <SelectField
          label="Order"
          value={localFilters.sortOrder}
          onChange={(e) =>
            updateImmediate({
              sortOrder: e.target.value as "desc" | "asc",
            })
          }
          disabled={loading}
        >
          <option value="asc">Ascending (Low to High / Oldest)</option>
          <option value="desc">Descending (High to Low / Newest)</option>
        </SelectField>
      </div>
    </div>
  );
}
