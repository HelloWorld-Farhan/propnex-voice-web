/**
 * Shared Telephony Utilities for Propnex Voice
 * Consolidates phone number formatting, credit calculation, endpoint resolution,
 * call type determination, and status normalization across webhooks and dashboard APIs.
 */

import type { CallStatus } from "@/types/call";

/**
 * Strips non-digit characters and removes India country code prefix (91)
 * or leading trunk prefix (0) to extract the core local number (usually 10 digits).
 */
export function getCoreNumber(number: any): string {
  if (!number) return "";
  const digits = String(number).replace(/\D/g, "");
  const no91 = digits.replace(/^91/, "");
  return no91.replace(/^0+/, "");
}

/**
 * Returns an array of phone number format variants for MongoDB lookups.
 * e.g., "07946350798" -> ["7946350798", "07946350798", "917946350798", "+917946350798"]
 */
export function getPhoneVariants(number: any): string[] {
  if (!number) return [];
  const raw = String(number).trim();
  const core = getCoreNumber(raw);
  if (!core) return [raw];
  return [...new Set([core, `0${core}`, `91${core}`, `+91${core}`, raw])];
}

/**
 * Cleans string representation of phone numbers, stripping placeholder "None" or "null" values.
 */
export function cleanPhone(val: any): string {
  if (!val) return "";
  const s = String(val).trim();
  if (
    s.toLowerCase() === "none" ||
    s.toLowerCase() === "null" ||
    s.toLowerCase() === "undefined"
  ) {
    return "";
  }
  return s;
}

/**
 * Formats phone number for clean UI presentation (e.g. +91XXXXXXXXXX).
 */
export function formatDisplayNumber(num?: string | null): string {
  if (!num) return "";
  const trimmed = cleanPhone(num);
  if (!trimmed) return "";
  if (trimmed.startsWith("+")) return trimmed;
  const core = getCoreNumber(trimmed);
  return core ? `+91${core}` : trimmed;
}

/**
 * Standard Telephony Credit Calculation for Propnex:
 * 1.75 credits per 30-second block (rounded up).
 */
export function calculateTelephonyCredits(durationSeconds: number): number {
  if (!durationSeconds || durationSeconds <= 0) return 0;
  const blocks = Math.ceil(durationSeconds / 30);
  return blocks * 1.75;
}

/**
 * Canonical Call Type Classifier:
 * - "campaign": Automated mass calls via CSV/AI campaign runner.
 * - "lead": Automated retry/reactivation queue calls.
 * - "internal": All one-to-one manual dials, direct PBX dials, Click2Call, and webhook calls.
 */
export function determineCallType(call: {
  campaignId?: string | null;
  correlationId?: string | null;
  callLogId?: string | null;
}): "campaign" | "lead" | "internal" {
  if (
    call.campaignId ||
    (call.correlationId &&
      (call.correlationId.startsWith("camp-") || call.correlationId.startsWith("campaign-")))
  ) {
    return "campaign";
  }
  if (call.correlationId && call.correlationId.startsWith("reactivation-")) {
    return "lead";
  }
  return "internal";
}

/**
 * Resolves DID vs. Customer phone numbers from Bonvoice Webhook payloads.
 * Handles variations in Bonvoice parameter naming (DisplayNumber, SourceNumber, etc.)
 */
export function resolveCallEndpoints(data: any, isInbound: boolean): {
  didNumber: string;
  callerNumber: string;
  callID: string;
  eventId: string;
  referenceId: string;
  actualDuration: number;
} {
  const callID = cleanPhone(data.callID || data.callId || data.call_id || data.uuid || "");
  let SourceNumber = cleanPhone(data.SourceNumber || data.source_number || data.sourceNumber || data.caller || data.from || "");
  let DestinationNumber = cleanPhone(data.DestinationNumber || data.destination_number || data.destinationNumber || data.to || data.customerNumber || data.customer_number || "");
  let DisplayNumber = cleanPhone(data.DisplayNumber || data.display_number || data.displayNumber || data.did || data.did_number || data.didNumber || "");

  // Parse numbers from callID if missing (Format: UUID-DID-CALLER-DATE-TIME)
  if (callID && callID.includes("-")) {
    const parts = callID.split("-");
    if (parts.length >= 3) {
      if (!DisplayNumber && !DestinationNumber) DisplayNumber = parts[1];
      if (!SourceNumber) SourceNumber = parts[2];
    }
  }

  const didNumber = isInbound
    ? (DisplayNumber || DestinationNumber || "")
    : (DisplayNumber || SourceNumber || "");

  const callerNumber = isInbound
    ? (SourceNumber || "")
    : (DestinationNumber || "");

  const eventId = cleanPhone(data.eventID || data.eventId || data.event_id || data.EventID || data.EventId || "");
  const referenceId = cleanPhone(data.reference_id || data.referenceId || data.ref_id || data.custom_id || "");
  const actualDuration = parseInt(String(data.CallDuration ?? data.callDuration ?? data.call_duration ?? data.duration ?? 0), 10) || 0;

  return {
    didNumber,
    callerNumber,
    callID,
    eventId,
    referenceId,
    actualDuration,
  };
}

/**
 * Normalizes raw Bonvoice / provider status into canonical dashboard CallStatus.
 */
export function normalizeCallStatus(
  rawStatus: string,
  durationSec: number = 0,
  hasRecording: boolean = false,
  isLive: boolean = false
): CallStatus {
  if (isLive) {
    const s = rawStatus.toLowerCase();
    if (s === "answered") return "answered";
    return "ringing";
  }

  if (hasRecording) {
    return "completed";
  }

  const s = rawStatus.toLowerCase();
  if (
    s === "no answer" ||
    s === "noanswer" ||
    s === "no_answer" ||
    s === "busy" ||
    s === "missed" ||
    s === "voicemail"
  ) {
    return "missed";
  }

  if (
    s === "failed" ||
    s === "cancelled" ||
    s === "cancel" ||
    s === "chanunavail" ||
    s === "congestion"
  ) {
    return "failed";
  }

  if (durationSec > 0 && s !== "failed") {
    return "completed";
  }

  return "failed";
}
