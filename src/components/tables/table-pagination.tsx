"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type TablePaginationProps = {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  className?: string;
};

export function TablePagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  className,
}: TablePaginationProps) {
  const start = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (p) =>
      p === 1 ||
      p === totalPages ||
      Math.abs(p - page) <= 1
  );

  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between py-2",
        className
      )}
    >
      <p className="text-sm text-muted-foreground font-medium">
        Showing <span className="text-foreground font-semibold">{start}</span>–<span className="text-foreground font-semibold">{end}</span> of{" "}
        <span className="text-foreground font-semibold">{totalItems}</span> results
      </p>

      <div className="flex items-center gap-1.5">
        <motion.button
          whileHover={{ scale: page <= 1 ? 1 : 1.05 }}
          whileTap={{ scale: page <= 1 ? 1 : 0.92 }}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
          className={cn(
            "relative inline-flex items-center justify-center size-8 rounded-lg border border-border bg-background/80 text-foreground text-sm font-medium transition-colors shadow-xs",
            "hover:bg-muted/80 hover:text-foreground active:bg-muted disabled:pointer-events-none disabled:opacity-40"
          )}
        >
          <ChevronLeft className="size-4" />
        </motion.button>

        {pages.map((p, index) => {
          const prev = pages[index - 1];
          const showEllipsis = prev !== undefined && p - prev > 1;
          const isActive = p === page;

          return (
            <span key={p} className="flex items-center gap-1">
              {showEllipsis && (
                <span className="px-1 text-muted-foreground font-bold select-none">…</span>
              )}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.92 }}
                onClick={() => onPageChange(p)}
                aria-label={`Page ${p}`}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative inline-flex items-center justify-center min-w-8 h-8 px-2 rounded-lg text-sm font-medium transition-colors shadow-xs",
                  isActive
                    ? "text-primary-foreground font-semibold"
                    : "border border-border bg-background/80 text-foreground hover:bg-muted/80 hover:text-foreground"
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="pagination-active-pill"
                    className="absolute inset-0 rounded-lg bg-primary shadow-sm"
                    transition={{ type: "spring", stiffness: 450, damping: 32 }}
                  />
                )}
                <span className="relative z-10">{p}</span>
              </motion.button>
            </span>
          );
        })}

        <motion.button
          whileHover={{ scale: page >= totalPages ? 1 : 1.05 }}
          whileTap={{ scale: page >= totalPages ? 1 : 0.92 }}
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
          className={cn(
            "relative inline-flex items-center justify-center size-8 rounded-lg border border-border bg-background/80 text-foreground text-sm font-medium transition-colors shadow-xs",
            "hover:bg-muted/80 hover:text-foreground active:bg-muted disabled:pointer-events-none disabled:opacity-40"
          )}
        >
          <ChevronRight className="size-4" />
        </motion.button>
      </div>
    </div>
  );
}
