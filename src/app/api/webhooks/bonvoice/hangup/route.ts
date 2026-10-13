import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// 1.75 credits per 30s block inbound, 3.5 outbound
function phoneVariants(number: any): string[] {
  if (!number) return [];
  const raw = String(number).trim();
  const digits = raw.replace(/\D/g, "");
  const no91 = digits.replace(/^91/, "");
  const core = no91.replace(/^0+/, "");
  if (!core) return [raw];
  return [...new Set([core, `0${core}`, `91${core}`, `+91${core}`, raw])];
}

function corePhone(number: any): string | null {
  if (!number) return null;
  const digits = String(number).replace(/\D/g, "");
  const no91 = digits.replace(/^91/, "");
  const core = no91.replace(/^0+/, "");
  return core || null;
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || "";
    let data: any;

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const text = await req.text();
      data = Object.fromEntries(new URLSearchParams(text));
    } else {
      data = await req.json();
    }

    console.log("Bonvoice Hangup Webhook:", JSON.stringify(data, null, 2));

    const callID = data.callID || data.callId || data.call_id || data.uuid || "";
    const Direction = data.Direction || data.direction || "";
    const StartTime = data.StartTime || data.start_time || data.startTime || "";
    const EndTime = data.EndTime || data.end_time || data.endTime || "";
    const cost = data.cost || data.Cost || "";
    const ResourceURL = data.ResourceURL || data.resource_url || data.resourceUrl || "";
    
    let SourceNumber = data.SourceNumber || data.source_number || data.sourceNumber || data.caller || "";
    let DestinationNumber = data.DestinationNumber || data.destination_number || data.destinationNumber || data.did || "";
    let DisplayNumber = data.DisplayNumber || data.display_number || data.displayNumber || "";
    
    // Duration: Bonvoice sends CallDuration in seconds
    const actualDuration = data.CallDuration ?? data.callDuration ?? data.call_duration ?? data.duration ?? 0;

    // Parse numbers from callID if missing
    if (callID && typeof callID === "string" && callID.includes("-")) {
      const parts = callID.split("-");
      if (parts.length >= 3) {
        if (!DisplayNumber && !DestinationNumber) DisplayNumber = parts[1];
        if (!SourceNumber) SourceNumber = parts[2];
      }
    }

    // Determine direction
    const directionRaw = Direction ? String(Direction).toLowerCase() : "";
    // Only treat as inbound if Direction is EXPLICITLY "inbound".
    // If Direction is missing/empty, treat as OUTBOUND so external outbound calls
    // (via Postman / third-party API) on outbound-only numbers are not silently dropped.
    const isInbound = directionRaw === "inbound";
    const isDirectionExplicit = directionRaw !== "";

    // Clean up "None" strings that Bonvoice sends for missing fields
    const cleanNum = (v: string) => (v && v.toLowerCase() !== "none" ? v : "");
    const srcNum = cleanNum(String(SourceNumber || "").trim());
    const dstNum = cleanNum(String(DestinationNumber || "").trim());
    const dispNum = cleanNum(String(DisplayNumber || "").trim());

    // Map DID and caller per direction:
    // INBOUND:  DID = DisplayNumber or DestinationNumber, Caller = SourceNumber
    // OUTBOUND: DID = SourceNumber or DisplayNumber,      Caller = DestinationNumber
    const didNumber    = isInbound
      ? String(dispNum || dstNum || "").trim()
      : String(dispNum || srcNum || "").trim();
    const callerNumber = isInbound
      ? String(srcNum || "").trim()
      : String(dstNum || "").trim();

    console.log(`Bonvoice Hangup: dir=${isInbound ? "INBOUND" : "OUTBOUND"} DID=${didNumber} caller=${callerNumber} callID=${callID}`);

    const recordingUrl = ResourceURL || "";
    const durationSec  = parseInt(String(actualDuration)) || 0;
    const callCost     = cost ? parseFloat(String(cost)) : 0;

    let finalMappedStatus = "COMPLETED"; // default for hangup
    
    // Evaluate explicit statuses in hangup webhook
    const statusRaw = (data.Status || data.status || "").toString().toUpperCase().trim();
    const agentStatusRaw = (data.AgentStatus || data.agent_status || "").toString().toUpperCase().trim();
    const effectiveStatus = (statusRaw === "NONE" || !statusRaw) && agentStatusRaw && agentStatusRaw !== "NONE" ? agentStatusRaw : statusRaw;

    if (isInbound) {
      if (effectiveStatus === "NO ANSWER" || effectiveStatus === "NOANSWER" || effectiveStatus === "NO_ANSWER" || effectiveStatus === "BUSY") {
        finalMappedStatus = "MISSED";
      } else if (effectiveStatus === "FAILED" || effectiveStatus === "CANCEL" || effectiveStatus === "CANCELLED" || effectiveStatus === "CHANUNAVAIL") {
        finalMappedStatus = "FAILED";
      } else if (durationSec === 0) {
        finalMappedStatus = "MISSED";
      }
    } else {
      // OUTBOUND: Any call cut by caller, unanswered, 0s duration or cancelled is FAILED (cannot "miss" an outbound call)
      if (effectiveStatus === "ANSWERED" && durationSec > 0) {
        finalMappedStatus = "COMPLETED";
      } else if (
        durationSec === 0 ||
        effectiveStatus === "NO ANSWER" ||
        effectiveStatus === "NOANSWER" ||
        effectiveStatus === "NO_ANSWER" ||
        effectiveStatus === "BUSY" ||
        effectiveStatus === "CANCEL" ||
        effectiveStatus === "CANCELLED" ||
        effectiveStatus === "FAILED" ||
        effectiveStatus === "CHANUNAVAIL"
      ) {
        finalMappedStatus = "FAILED";
      }
    }

    // Credit calculation: 1.75 credits per 30s block for all calls
    let creditsUsed = 0;
    if (durationSec > 0) {
      const blocks = Math.ceil(durationSec / 30);
      creditsUsed = blocks * 1.75;
    }

    const didVariants = phoneVariants(didNumber);
    const callerCore  = corePhone(callerNumber);

    // 1. Find existing call logs by callID or eventId
    let existingLogs: any[] = [];
    let eventId = data.eventID || data.eventId || data.event_id || data.EventID || data.EventId || "";
    if (callID && typeof callID === "string" && callID.includes("xx")) {
      eventId = callID.split("xx")[0];
    }

    if (callID || eventId) {
      existingLogs = await prisma.callLog.findMany({
        where: {
          OR: [
            ...(callID ? [{ providerCallId: String(callID) }] : []),
            ...(eventId ? [{ callLogId: eventId }] : []),
            ...(eventId ? [{ publicId: eventId }] : [])
          ]
        },
        include: { phoneNumber: { include: { company: true } } },
      });
    }

    // 2. Find call logs by DID (RINGING/ANSWERED status) - as fallback if callID missing
    if (existingLogs.length === 0 && didVariants.length > 0) {
      existingLogs = await prisma.callLog.findMany({
        where: {
          status:      { in: ["RINGING", "ANSWERED", "QUEUED", "DISPATCHING", "QUEUED_AT_PROVIDER", "PENDING"] },
          phoneNumber: { number: { in: didVariants } },
        },
        include: { phoneNumber: { include: { company: true } } },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
      // Filter out old calls (older than 1 hour)
      existingLogs = existingLogs.filter((log: any) => Date.now() - log.createdAt.getTime() < 3600000);
    }

    // 3. Last resort: look for a platform-created log with OUT-/pending- prefix providerCallId
    // that matches the DID phone number — covers the case where notification webhook arrived
    // before we could link the Bonvoice callID to the platform log
    if (existingLogs.length === 0 && didVariants.length > 0) {
      const callerCoreStr = corePhone(callerNumber);
      const platformLogs = await prisma.callLog.findMany({
        where: {
          phoneNumber: { number: { in: didVariants } },
          OR: [
            { providerCallId: { startsWith: "OUT-" } },
            { providerCallId: { startsWith: "pending-" } },
            { providerCallId: { startsWith: "DISP-" } },
          ],
        },
        include: { phoneNumber: { include: { company: true } }, lead: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
      // Filter by caller phone if available, else take most recent within 2 hours
      const recentPlatform = platformLogs.filter((l: any) => Date.now() - l.createdAt.getTime() < 7200000);
      if (callerCoreStr) {
        const callerMatch = recentPlatform.filter((l: any) => (l.lead?.phone || "").replace(/\D/g, "").slice(-10) === callerCoreStr.slice(-10));
        existingLogs = callerMatch.length > 0 ? callerMatch : recentPlatform.slice(0, 1);
      } else {
        existingLogs = recentPlatform.slice(0, 1);
      }
      if (existingLogs.length > 0) {
        console.log(`Bonvoice Hangup: Found ${existingLogs.length} platform log(s) via OUT-/pending- fallback lookup`);
      }
    }


    let startTimeParsed = new Date();
    if (StartTime) {
      const stStr = String(StartTime);
      if (stStr.includes("T")) {
        startTimeParsed = new Date(stStr);
      } else {
        startTimeParsed = new Date(`${stStr.replace(" ", "T")}+05:30`);
      }
      if (isNaN(startTimeParsed.getTime())) startTimeParsed = new Date();
    }

    let endTimeParsed = new Date();
    if (EndTime) {
      const etStr = String(EndTime);
      if (etStr.includes("T")) {
        endTimeParsed = new Date(etStr);
      } else {
        endTimeParsed = new Date(`${etStr.replace(" ", "T")}+05:30`);
      }
      if (isNaN(endTimeParsed.getTime())) endTimeParsed = new Date();
    }

    const logsToCharge: { companyId: string; callLogId: string }[] = [];

    if (existingLogs.length > 0) {
      // 3a. Update existing call logs → COMPLETED
      // If multiple logs exist (e.g. from historical duplicate bug), select the primary one for credit deduction
      const primaryLog = existingLogs.find((l: any) => l.companyId && l.phoneNumber?.company?.parentCompanyId)
        || existingLogs.find((l: any) => l.companyId)
        || existingLogs[0];

      // Check if this inbound call is on an outbound-only number.
      // ONLY apply when direction is explicitly inbound — don't drop outbound calls
      // that have no Direction field (e.g. external calls via Postman/API).
      const phoneDir = (primaryLog?.phoneNumber?.direction || "").toUpperCase();
      const isOutboundOnlyInbound = isInbound && isDirectionExplicit && primaryLog?.phoneNumber && phoneDir !== "INBOUND" && phoneDir !== "BOTH";

      if (isOutboundOnlyInbound) {
        console.log(`Bonvoice Hangup: Inbound call on outbound-only number detected for log ${primaryLog?.id}. Zeroing credits and detaching company.`);
        creditsUsed = 0;
      }

      for (const log of existingLogs) {
        let lead: any = null;
        if (isInbound && !log.leadId && callerCore && log.companyId) {
          lead = await prisma.lead.findFirst({
            where: { companyId: log.companyId, phone: { contains: callerCore } }
          });
        }

        const isPrimary = log.id === primaryLog?.id;

        await prisma.callLog.update({
          where: { id: log.id },
          data: {
            status:          finalMappedStatus as any,
            durationSeconds: durationSec,
            cost:            isPrimary && !isOutboundOnlyInbound ? callCost : 0,
            creditsUsed:     isPrimary && !isOutboundOnlyInbound ? creditsUsed : 0,
            recordingUrl:    recordingUrl || undefined,
            endedAt:         endTimeParsed,
            providerCallId:  String(callID),
            providerStatus:  finalMappedStatus,
            providerWebhook: data,
            historicalDidString: log.historicalDidString || didNumber,
            historicalChannels: log.historicalChannels || 1,
            ...(isOutboundOnlyInbound ? { companyId: null, phoneNumberId: null } : {}),
            ...(lead ? { leadId: lead.id } : {}),
          },
        });
      }

      // Charge credits ONLY ONCE for the primary company IF NOT outbound-only inbound
      if (!isOutboundOnlyInbound && primaryLog?.companyId && creditsUsed > 0) {
        logsToCharge.push({ companyId: primaryLog.companyId, callLogId: primaryLog.id });
      }
      console.log(`Bonvoice Hangup: Updated ${existingLogs.length} call logs → COMPLETED (${durationSec}s), charged single company=${isOutboundOnlyInbound ? "NONE" : primaryLog?.companyId}`);
    } else {
      // 3b. Create SINGLE NEW COMPLETED call log (if notification webhook was missed)
      const candidates = await prisma.phoneNumber.findMany({
        where: { number: { in: didVariants } },
        include: { company: true },
        orderBy: { updatedAt: "desc" },
      });

      if (candidates.length === 0) {
        console.warn("Bonvoice Hangup: No PhoneNumber matched in DB. Proceeding without company linkage.");
        await prisma.callLog.create({
          data: {
            callLogId:       `CL${Date.now()}`,
            publicId:        `bonvoice-${Date.now()}`,
            direction:       isInbound ? "INBOUND" : "OUTBOUND",
            status:          finalMappedStatus as any,
            providerCallId:  callID ? String(callID) : undefined,
            startedAt:       startTimeParsed,
            endedAt:         endTimeParsed,
            durationSeconds: durationSec,
            cost:            callCost,
            creditsUsed:     creditsUsed,
            recordingUrl:    recordingUrl || undefined,
            provider:        "BONVOICE",
            providerStatus:  finalMappedStatus,
            providerWebhook: data,
            historicalDidString: didNumber,
            historicalChannels: 1,
          },
        });
      } else {
        // Pick SINGLE target candidate
        // If this is an INBOUND call, ONLY candidates assigned as INBOUND or BOTH are eligible.
        // If outbound-only: do NOT link to company, do NOT charge credits, do NOT increment inbound count.
        // ONLY apply this filter when direction is EXPLICITLY inbound \u2014 don't drop external
        // outbound calls (via Postman/API) that omit the Direction field.
        let filtered = candidates;
        if (isInbound && isDirectionExplicit) {
          filtered = candidates.filter(p => {
            const dir = (p.direction || "").toUpperCase();
            return dir === "INBOUND" || dir === "BOTH";
          });

          if (filtered.length === 0) {
            console.log(`Bonvoice Hangup: Inbound call received on OUTBOUND-only number (${didNumber}). Dropping company association (no credit deduction, no inbound count increase).`);
            return NextResponse.json({ success: true, message: "Ignored inbound call on outbound-only number" });
          }
        }

        const activeFiltered = filtered.filter(p => !p.status || p.status === "ACTIVE");
        const pool = activeFiltered.length > 0 ? activeFiltered : filtered;

        const subCompanyCandidate = pool.find(p => p.company && (p.company as any).parentCompanyId);
        const parentCompanyCandidate = pool.find(p => p.company && !(p.company as any).parentCompanyId);
        const targetPhoneNumber = subCompanyCandidate || parentCompanyCandidate || pool[0];

        // Concurrency guard: check if already created
        if (callID) {
          const already = await prisma.callLog.findFirst({
            where: { providerCallId: String(callID) }
          });
          if (already) {
            console.log(`Bonvoice Hangup: CallLog already exists for providerCallId ${callID}`);
            return NextResponse.json({ success: true });
          }
        }

        let lead: any = null;
        if (isInbound && callerCore && targetPhoneNumber.companyId) {
          lead = await prisma.lead.findFirst({
            where: { companyId: targetPhoneNumber.companyId, phone: { contains: callerCore } },
          });
        }

        const newLog = await prisma.callLog.create({
          data: {
            callLogId:       `CL${Date.now()}-${targetPhoneNumber.id.substring(0, 5)}`,
            publicId:        `bonvoice-${Date.now()}-${targetPhoneNumber.id.substring(0, 5)}`,
            direction:       isInbound ? "INBOUND" : "OUTBOUND",
            status:          finalMappedStatus as any,
            companyId:       targetPhoneNumber.companyId ?? undefined,
            phoneNumberId:   targetPhoneNumber.id,
            leadId:          lead?.id ?? undefined,
            aiAgentId:       isInbound ? (targetPhoneNumber.inboundAgentId ?? undefined) : (targetPhoneNumber.outboundAgentId ?? undefined),
            providerCallId:  callID ? String(callID) : undefined,
            startedAt:       startTimeParsed,
            endedAt:         endTimeParsed,
            durationSeconds: durationSec,
            cost:            callCost,
            creditsUsed:     creditsUsed,
            recordingUrl:    recordingUrl || undefined,
            provider:        "BONVOICE",
            providerStatus:  finalMappedStatus,
            providerWebhook: data,
            historicalDidString: targetPhoneNumber.number,
            historicalChannels: targetPhoneNumber.channels || 1,
          },
        });
        if (targetPhoneNumber.companyId && creditsUsed > 0) {
          logsToCharge.push({ companyId: targetPhoneNumber.companyId, callLogId: newLog.id });
        }
        console.log(`Bonvoice Hangup: Created SINGLE new call log ${newLog.id} → COMPLETED (${durationSec}s) company=${targetPhoneNumber.companyId}`);
      }
    }

    // 4. Deduct credits for ALL companies involved
    if (creditsUsed > 0 && logsToCharge.length > 0) {
      for (const charge of logsToCharge) {
        try {
          await prisma.$transaction(async (tx) => {
            await tx.creditUsage.create({
              data: {
                companyId:   charge.companyId,
                amount:      creditsUsed,
                reason:      "CALL",
                callLogId:   charge.callLogId,
                description: `${isInbound ? "Inbound" : "Outbound"} call (${durationSec}s, ${creditsUsed.toFixed(2)} credits)`,
              },
            });

            await tx.creditBalance.upsert({
              where:  { companyId: charge.companyId },
              create: {
                companyId:        charge.companyId,
                creditsRemaining: Math.max(0, -creditsUsed),
                creditsUsed:      creditsUsed,
              },
              update: {
                creditsRemaining: { decrement: creditsUsed },
                creditsUsed:      { increment: creditsUsed },
              },
            });
          });

          // 4b. Check if credit balance reached 0 or below
          try {
            const updatedBalance = await prisma.creditBalance.findUnique({
              where: { companyId: charge.companyId }
            });
            if (updatedBalance && (updatedBalance.creditsRemaining ?? 0) <= 0) {
              console.warn(`[Bonvoice Hangup] Credit balance reached 0 (${updatedBalance.creditsRemaining}) for company: ${charge.companyId}. Halting operations.`);

              // Cancel any PENDING outbound calls in DB for this company so no calls continue
              await prisma.callLog.updateMany({
                where: {
                  companyId: charge.companyId,
                  direction: "OUTBOUND",
                  status: "PENDING"
                },
                data: { status: "FAILED", durationSeconds: 0 }
              });

              // Dispatch zero-credit email alert to User AND Admin
              const comp = await prisma.company.findUnique({
                where: { id: charge.companyId },
                include: { members: { include: { user: true }, take: 1 } }
              });
              const primaryUser = comp?.members?.[0]?.user;
              if (primaryUser?.email) {
                const APPS_SCRIPT_URL =
                  process.env.APPS_SCRIPT_WEBHOOK_URL ||
                  process.env.GOOGLE_APPS_SCRIPT_URL ||
                  "https://script.google.com/macros/s/AKfycbz2zj_l7vcmiPZKuYqEVdso0apyW3aDJZZWTVTJ1jRrQr8PLGZIH_TzRpTLFskphIwgDQ/exec";

                await fetch(APPS_SCRIPT_URL, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    type: "CREDIT_ZERO_WARNING",
                    data: {
                      email: primaryUser.email,
                      name: `${primaryUser.firstName || ""} ${primaryUser.lastName || ""}`.trim() || "Valued User",
                      companyName: comp?.name || "Your Workspace",
                      credits: 0
                    }
                  })
                }).catch(e => console.error("[Bonvoice Hangup] Error sending zero credit alert:", e));
              }
            }
          } catch (postCheckErr) {
            console.error("[Bonvoice Hangup] Error in post-deduction zero credit check:", postCheckErr);
          }
        } catch (err) {
          console.error("Bonvoice Hangup: Failed to deduct credits for company:", charge.companyId, err);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Bonvoice Hangup Webhook Error:", error?.message ?? error);
    return NextResponse.json(
      { error: "Internal Server Error", detail: error?.message },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ success: true });
}
