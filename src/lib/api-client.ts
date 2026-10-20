const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ??
  "";

export type ApiResponse<T> = {
  data: T;
  error?: string;
};

export type InboundCallApiItem = {
  id: string;
  publicId: string;
  callLogId: string;
  direction: "INBOUND" | "OUTBOUND";
  status: string;
  provider: string;
  companyId: string;
  phoneNumberId: string | null;
  aiAgentId: string | null;
  campaignId: string | null;
  correlationId: string | null;
  providerCallId: string | null;
  providerStatus: string | null;
  durationSeconds: number;
  recordingUrl: string | null;
  transcriptUrl: string | null;
  disconnectReason: string | null;
  answeredAt: string | null;
  endedAt: string | null;
  startedAt: string;
  createdAt: string;
  updatedAt: string;
  customerNumber?: string | null;
  assignedNumber?: string | null;
  providerWebhook?: any;
  phoneNumber?: string | null;
};

export type CallListApiResponse = {
  data: InboundCallApiItem[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};

export type CallListParams = {
  direction?: "INBOUND" | "OUTBOUND";
  status?: string;
  companyId?: string;
  phoneNumberId?: string;
  provider?: string;
  page?: number;
  limit?: number;
  search?: string;
  assignedNumber?: string;
  callerNumber?: string;
  dateFrom?: string;
  dateTo?: string;
  minDuration?: string;
  durationUnit?: "sec" | "min";
  sortBy?: "date" | "duration";
  sortOrder?: "desc" | "asc";
  callType?: string;
};

export async function fetchInboundCalls(
  params: CallListParams = {}
): Promise<CallListApiResponse> {
  const query = new URLSearchParams();
  if (params.status && params.status !== "all") query.set("status", params.status.toUpperCase());
  if (params.callType && params.callType !== "all") query.set("callType", params.callType);
  if (params.phoneNumberId) query.set("phoneNumberId", params.phoneNumberId);
  if (params.provider) query.set("provider", params.provider);
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  if (params.direction) query.set("direction", params.direction);
  if (params.search) query.set("search", params.search);
  if (params.assignedNumber) query.set("assignedNumber", params.assignedNumber);
  if (params.callerNumber) query.set("callerNumber", params.callerNumber);
  if (params.dateFrom) query.set("dateFrom", params.dateFrom);
  if (params.dateTo) query.set("dateTo", params.dateTo);
  if (params.minDuration) query.set("minDuration", params.minDuration);
  if (params.durationUnit) query.set("durationUnit", params.durationUnit);
  if (params.sortBy) query.set("sortBy", params.sortBy);
  if (params.sortOrder) query.set("sortOrder", params.sortOrder);

  let token = "";
  let companyId = params.companyId || "";
  let userEmail = "";

  if (typeof window !== "undefined") {
    token = localStorage.getItem("accessToken") || localStorage.getItem("access_token") || "";
    try {
      const userStr = localStorage.getItem("user");
      if (userStr) {
        const user = JSON.parse(userStr);
        if (!companyId) companyId = user.companyId || user.company_id || "";
        userEmail = user.email || "";
      }
    } catch (e) {
      // ignore parse errors
    }
  }

  if (companyId) query.set("companyId", companyId);
  query.set("t", Date.now().toString());

  const endpoint = params.direction === "OUTBOUND" ? "outbound" : "inbound";
  const url = `${API_BASE_URL}/api/calls/${endpoint}${query.toString() ? `?${query}` : ""}`;

  const res = await fetch(url, {
    cache: "no-store",
    headers: { 
      "Content-Type": "application/json",
      ...(token ? { "Authorization": `Bearer ${token}` } : {}),
      ...(companyId ? { "X-Company-Id": companyId } : {}),
      ...(userEmail ? { "X-User-Email": userEmail } : {}),
    },
  });

  if (!res.ok) {
    let errMsg = res.statusText;
    try {
      const errData = await res.json();
      if (errData && errData.error) errMsg = errData.error;
      else if (errData && errData.message) errMsg = errData.message;
    } catch(e) {}
    throw new Error(`Inbound calls API error: ${res.status} ${errMsg}`);
  }

  return res.json() as Promise<CallListApiResponse>;
}
