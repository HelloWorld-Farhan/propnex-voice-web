import { cva, type VariantProps } from "class-variance-authority";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusBadgeVariants = cva("", {
  variants: {
    status: {
      completed: "",
      missed: "",
      failed: "",
      active: "",
      pending: "",
      "in-progress": "",
      ringing: "",
      answered: "",
    },
  },
  defaultVariants: {
    status: "pending",
  },
});

const statusConfig = {
  completed: { label: "Completed", variant: "success" as const },
  missed: { label: "Missed", variant: "warning" as const },
  failed: { label: "Failed", variant: "destructive" as const },
  active: { label: "Active", variant: "success" as const },
  pending: { label: "Pending", variant: "secondary" as const },
  "in-progress": { label: "In Progress", variant: "default" as const },
  ringing: { label: "Ringing", variant: "default" as const },
  answered: { label: "Active Call", variant: "success" as const },
} satisfies Record<
  NonNullable<VariantProps<typeof statusBadgeVariants>["status"]>,
  { label: string; variant: "default" | "secondary" | "success" | "warning" | "destructive" }
>;

type StatusBadgeProps = VariantProps<typeof statusBadgeVariants> & {
  className?: string;
};

export function StatusBadge({ status = "pending", className }: StatusBadgeProps) {
  const norm = String(status || "pending").toLowerCase().trim();
  const safeStatus = norm as keyof typeof statusConfig;
  const config = statusConfig[safeStatus] || { label: norm.charAt(0).toUpperCase() + norm.slice(1), variant: "secondary" };
  const isLive = norm === "ringing" || norm === "answered";

  return (
    <Badge variant={config.variant} className={cn("gap-1.5", className)}>
      {isLive && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-current" />
        </span>
      )}
      {config.label}
    </Badge>
  );
}
