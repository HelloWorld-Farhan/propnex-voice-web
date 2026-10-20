export type CallStatus = "completed" | "missed" | "failed" | "ringing" | "active" | "answered" | "in-progress";

export type CallDirection = "inbound" | "outbound";

export type TranscriptLine = {
  speaker: "agent" | "customer";
  text: string;
  timestamp: string;
};

export type CallRecord = {
  id: string;
  callId?: string;
  callerId?: string;
  customerNumber: string;
  assignedNumber: string;
  callDateTime: string;
  duration: string;
  durationSeconds: number;
  status: CallStatus;
  creditsUsed: number;
  recordingUrl?: string;
  transcriptUrl?: string;
  transcript: TranscriptLine[];
  liveStartedAt?: string; // ISO timestamp for live duration counter
  callType?: "lead" | "campaign" | "internal";
};

export type CallTypeFilter = "all" | "campaign" | "lead" | "internal";

export type CallLogFilters = {
  search: string;
  status: CallStatus | "all";
  callType?: CallTypeFilter;
  dateFrom: string;
  dateTo: string;
  assignedNumber: string;
  callerNumber: string;
  minDuration: string;
  durationUnit: "sec" | "min";
  sortBy: "date" | "duration";
  sortOrder: "desc" | "asc";
};

export const DEFAULT_CALL_FILTERS: CallLogFilters = {
  search: "",
  status: "all",
  callType: "all",
  dateFrom: "",
  dateTo: "",
  assignedNumber: "",
  callerNumber: "",
  minDuration: "",
  durationUnit: "sec",
  sortBy: "date",
  sortOrder: "desc",
};

export const CALL_STATUS_OPTIONS: { value: CallStatus | "all"; label: string }[] =
  [
    { value: "all", label: "All Statuses" },
    { value: "completed", label: "Completed" },
    { value: "missed", label: "Missed" },
    { value: "failed", label: "Failed" },
  ];

export const CALL_TYPE_OPTIONS: { value: CallTypeFilter; label: string; badge: string; colorClass: string; dotClass: string }[] =
  [
    { value: "all", label: "All Types", badge: "ALL", colorClass: "text-muted-foreground", dotClass: "bg-muted-foreground/60" },
    { value: "campaign", label: "Campaign", badge: "CAMPAIGN", colorClass: "text-fuchsia-400 font-bold", dotClass: "bg-fuchsia-500" },
    { value: "lead", label: "Lead", badge: "LEAD", colorClass: "text-emerald-400 font-bold", dotClass: "bg-emerald-500" },
    { value: "internal", label: "Internal", badge: "INTERNAL", colorClass: "text-purple-400 font-bold", dotClass: "bg-purple-500" },
  ];

