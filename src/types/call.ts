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

export type CallLogFilters = {
  search: string;
  status: CallStatus | "all";
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
  dateFrom: "",
  dateTo: "",
  assignedNumber: "",
  callerNumber: "",
  minDuration: "",
  durationUnit: "sec",
  sortBy: "duration",
  sortOrder: "asc",
};

export const CALL_STATUS_OPTIONS: { value: CallStatus | "all"; label: string }[] =
  [
    { value: "all", label: "All Statuses" },
    { value: "completed", label: "Completed" },
    { value: "missed", label: "Missed" },
    { value: "failed", label: "Failed" },
  ];
