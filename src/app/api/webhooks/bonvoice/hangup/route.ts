import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  getPhoneVariants,
  getCoreNumber,
  cleanPhone,
  calculateTelephonyCredits,
  resolveCallEndpoints,
} from "@/lib/telephony-utils";

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

    const Direction = data.Direction || data.direction || "";
    const StartTime = data.StartTime || data.start_time || data.startTime || "";
    const EndTime = data.EndTime || data.end_time || data.endTime || "";
    const cost = data.cost || data.Cost || "";
    const ResourceURL = data.ResourceURL || data.resource_url || data.resourceUrl || "";

    const directionRaw = Direction ? String(Direction).toLowerCase() : "";
    const isInbound = directionRaw === "inbound";
    const isDirectionExplicit = directionRaw !== "";

    const endpoints = resolveCallEndpoints(data, isInbound);
    let didNumber = endpoints.didNumber;
    let callerNumber = endpoints.callerNumber;
    const callID = endpoints.callID;
    const referenceId = endpoints.referenceId;
    let eventId = endpoints.eventId;
    const actualDuration = endpoints.actualDuration;

    // Intelligent DID discovery for Postman/API/webhook calls:
    // If didNumber doesn't match an assigned DID, but callerNumber does, swap them!
    const testVariants1 = getPhoneVariants(didNumber);
    const hasMatch1 = await prisma.phoneNumber.findFirst({
      where: { number: { in: testVariants1 } },
      select: { id: true }
    });
    if (!hasMatch1 && callerNumber) {
      const testVariants2 = getPhoneVariants(callerNumber);
      const hasMatch2 = await prisma.phoneNumber.findFirst({
        where: { number: { in: testVariants2 } },
        select: { id: true }
      });
      if (hasMatch2) {
        const temp = didNumber;
        didNumber = callerNumber;
        callerNumber = temp;
      }
    }

    console.log(`Bonvoice Hangup: dir=${isInbound ? "INBOUND" : "OUTBOUND"} DID=${didNumber} caller=${callerNumber} callID=${callID} ref=${referenceId}`);

    const recordingUrl = ResourceURL || "";
    const callCost     = cost ? parseFloat(String(cost)) : 0;

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

    let durationSec = parseInt(String(actualDuration)) || 0;
    if (durationSec === 0 && StartTime && EndTime) {
      const timeDiff = Math.round((endTimeParsed.getTime() - startTimeParsed.getTime()) / 1000);
      if (timeDiff > 0 && timeDiff <= 3600) {
        durationSec = timeDiff;
      }
    }

    let finalMappedStatus = "COMPLETED"; // default for hangup
    
    // Evaluate explicit statuses in hangup webhook
    const statusRaw = (data.Status || data.status || data.call_status || data.callStatus || "").toString().toUpperCase().trim();
    const agentStatusRaw = (data.AgentStatus || data.agent_status || "").toString().toUpperCase().trim();
    const effectiveStatus = (statusRaw === "NONE" || !statusRaw) && agentStatusRaw && agentStatusRaw !== "NONE" ? agentStatusRaw : statusRaw;

    if (isInbound) {
      if (recordingUrl && recordingUrl.trim().length > 0) {
        finalMappedStatus = "COMPLETED";
      } else if (effectiveStatus === "NO ANSWER" || effectiveStatus === "NOANSWER" || effectiveStatus === "NO_ANSWER" || effectiveStatus === "BUSY" || effectiveStatus === "MISSED") {
        finalMappedStatus = "MISSED";
      } else if (effectiveStatus === "FAILED" || effectiveStatus === "CANCEL" || effectiveStatus === "CANCELLED" || effectiveStatus === "CHANUNAVAIL") {
        finalMappedStatus = "FAILED";
      } else if (durationSec === 0) {
        finalMappedStatus = "MISSED";
      }
    } else {
      // OUTBOUND:
      if (recordingUrl && recordingUrl.trim().length > 0) {
        finalMappedStatus = "COMPLETED";
        if (durationSec === 0) {
          durationSec = 26; // Sensible fallback for recorded audio
        }
      } else if (effectiveStatus === "ANSWERED" && durationSec > 0) {
        finalMappedStatus = "COMPLETED";
      } else if (
        effectiveStatus === "NO ANSWER" ||
        effectiveStatus === "NOANSWER" ||
        effectiveStatus === "NO_ANSWER" ||
        effectiveStatus === "MISSED" ||
        effectiveStatus === "BUSY" ||
        effectiveStatus === "VOICEMAIL"
      ) {
        finalMappedStatus = "MISSED";
      } else if (
        effectiveStatus === "CANCEL" ||
        effectiveStatus === "CANCELLED" ||
        effectiveStatus === "FAILED" ||
        effectiveStatus === "CHANUNAVAIL" ||
        effectiveStatus === "CONGESTION"
      ) {
        finalMappedStatus = "FAILED";
      } else if (durationSec > 0) {
        finalMappedStatus = "COMPLETED";
      } else {
        finalMappedStatus = "FAILED";
      }
    }

    // Standardized credit calculation
    let creditsUsed = 0;
    if (finalMappedStatus === "COMPLETED") {
      creditsUsed = calculateTelephonyCredits(durationSec > 0 ? durationSec : 30);
    }

    const didVariants = getPhoneVariants(didNumber);
    const callerCore  = getCoreNumber(callerNumber);

    // 1. Find existing call logs by referenceId, callID, or eventId
    let existingLogs: any[] = [];
    if (callID && typeof callID === "string" && callID.includes("xx")) {
      const rawPfx = callID.split("xx")[0];
      if (!rawPfx.startsWith("20260909_")) {
        eventId = rawPfx;
      }
    }
    const isGenericEventId = eventId.startsWith("20260909_");

    if (referenceId || callID || (eventId && !isGenericEventId)) {
      existingLogs = await prisma.callLog.findMany({
        where: {
          OR: [
            ...(referenceId ? [{ id: referenceId }] : []),
            ...(callID ? [{ providerCallId: String(callID) }] : []),
            ...((eventId && !isGenericEventId) ? [{ callLogId: eventId }, { publicId: eventId }] : [])
          ]
        },
        include: { phoneNumber: { include: { company: true } }, lead: true },
      });
    }

    // 2. Find call logs by DID (RINGING/ANSWERED status) - as fallback if callID missing, MUST match caller if known
    if (existingLogs.length === 0 && didVariants.length > 0) {
      const liveLogs = await prisma.callLog.findMany({
        where: {
          status:      { in: ["RINGING", "ANSWERED", "QUEUED", "DISPATCHING", "QUEUED_AT_PROVIDER", "PENDING"] },
          phoneNumber: { number: { in: didVariants } },
        },
        include: { phoneNumber: { include: { company: true } }, lead: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
      const recentLive = liveLogs.filter((log: any) => Date.now() - log.createdAt.getTime() < 3600000);
      if (callerCore) {
        existingLogs = recentLive.filter((l: any) => (l.lead?.phone || "").replace(/\D/g, "").slice(-10) === callerCore.slice(-10));
      } else {
        existingLogs = recentLive.slice(0, 1);
      }
    }

    // 3. Last resort: look for a platform-created log with OUT-/pending- prefix providerCallId
    // that matches BOTH the DID AND the caller/customer number
    if (existingLogs.length === 0 && didVariants.length > 0) {
      const callerCoreStr = getCoreNumber(callerNumber);
      if (callerCoreStr) {
        const platformLogs = await prisma.callLog.findMany({
          where: {
            phoneNumber: { number: { in: didVariants } },
            lead: { phone: { contains: callerCoreStr.slice(-10) } },
            OR: [
              { providerCallId: { startsWith: "OUT-" } },
              { providerCallId: { startsWith: "pending-" } },
              { providerCallId: { startsWith: "DISP-" } },
            ],
          },
          include: { phoneNumber: { include: { company: true } }, lead: true },
          orderBy: { createdAt: "desc" },
          take: 5,
        });
        existingLogs = platformLogs.filter((l: any) => Date.now() - l.createdAt.getTime() < 7200000);
      }
      if (existingLogs.length > 0) {
        console.log(`Bonvoice Hangup: Found ${existingLogs.length} platform log(s) matching caller ${callerCoreStr}`);
      }
    }

    const logsToCharge: { companyId: string; callLogId: string }[] = [];

    if (existingLogs.length > 0) {
      // 3a. Update existing call logs
      const primaryLog = existingLogs.find((l: any) => l.companyId && l.phoneNumber?.company?.parentCompanyId)
        || existingLogs.find((l: any) => l.companyId)
        || existingLogs[0];

      const phoneDir = (primaryLog?.phoneNumber?.direction || "").toUpperCase();
      const isOutboundOnlyInbound = isInbound && isDirectionExplicit && primaryLog?.phoneNumber && phoneDir !== "INBOUND" && phoneDir !== "BOTH";

      if (isOutboundOnlyInbound) {
        console.log(`Bonvoice Hangup: Inbound call on outbound-only number detected for log ${primaryLog?.id}. Zeroing credits and detaching company.`);
        creditsUsed = 0;
      }

      for (const log of existingLogs) {
        let lead: any = null;
        if (!log.leadId && callerCore && log.companyId) {
          lead = await prisma.lead.findFirst({
            where: { companyId: log.companyId, phone: { contains: callerCore } }
          });
          if (!lead && callerNumber) {
            try {
              let stage = await prisma.leadPipelineStage.findFirst({ where: { companyId: log.companyId } });
              if (!stage) {
                stage = await prisma.leadPipelineStage.create({
                  data: { companyId: log.companyId, name: "New", slug: "new", order: 1 }
                });
              }
              lead = await prisma.lead.create({
                data: {
                  companyId: log.companyId,
                  phone: callerNumber.startsWith("+") ? callerNumber : `+91${callerNumber.replace(/\D/g, "").slice(-10)}`,
                  firstName: isInbound ? "Incoming" : "Internal",
                  lastName: isInbound ? "Caller" : "Call",
                  stageId: stage.id,
                }
              });
            } catch (errLead) {
              console.warn("Could not auto-create lead in hangup:", errLead);
            }
          }
        }

        const isPrimary = log.id === primaryLog?.id;
        const safeStatus = (log.recordingUrl || recordingUrl) ? "COMPLETED" : finalMappedStatus;
        const safeDuration = (safeStatus === "COMPLETED" && durationSec === 0) 
          ? (log.durationSeconds > 0 ? log.durationSeconds : 26) 
          : (durationSec > 0 ? durationSec : log.durationSeconds);
        const safeCredits = safeDuration > 0 ? Math.ceil(safeDuration / 30) * 1.75 : creditsUsed;

        await prisma.callLog.update({
          where: { id: log.id },
          data: {
            status:          safeStatus as any,
            durationSeconds: safeDuration,
            cost:            isPrimary && !isOutboundOnlyInbound ? callCost : 0,
            creditsUsed:     isPrimary && !isOutboundOnlyInbound ? safeCredits : 0,
            recordingUrl:    recordingUrl || undefined,
            endedAt:         endTimeParsed,
            providerCallId:  String(callID),
            providerStatus:  safeStatus,
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
        console.warn("Bonvoice Hangup: No PhoneNumber matched in DB. Attempting loose company lookup.");
        
        // Attempt to find company by loose DID match (search for any PhoneNumber containing DID digits)
        let fallbackCompanyId: string | undefined = undefined;
        if (didNumber) {
          const didCore = getCoreNumber(didNumber);
          if (didCore) {
            const looseMatch = await prisma.phoneNumber.findFirst({
              where: { number: { contains: didCore } },
              select: { companyId: true },
              orderBy: { updatedAt: "desc" },
            });
            if (looseMatch?.companyId) {
              fallbackCompanyId = looseMatch.companyId;
              console.log(`Bonvoice Hangup: Found fallback company ${fallbackCompanyId} via loose DID match`);
            }
          }
        }
        
        await prisma.callLog.create({
          data: {
            callLogId:       `CL${Date.now()}`,
            publicId:        `bonvoice-${Date.now()}`,
            direction:       isInbound ? "INBOUND" : "OUTBOUND",
            status:          finalMappedStatus as any,
            companyId:       fallbackCompanyId,
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
        if (callerCore && targetPhoneNumber.companyId) {
          lead = await prisma.lead.findFirst({
            where: { companyId: targetPhoneNumber.companyId, phone: { contains: callerCore } },
          });
          if (!lead && callerNumber) {
            try {
              let stage = await prisma.leadPipelineStage.findFirst({ where: { companyId: targetPhoneNumber.companyId } });
              if (!stage) {
                stage = await prisma.leadPipelineStage.create({
                  data: { companyId: targetPhoneNumber.companyId, name: "New", slug: "new", order: 1 }
                });
              }
              lead = await prisma.lead.create({
                data: {
                  companyId: targetPhoneNumber.companyId,
                  phone: callerNumber.startsWith("+") ? callerNumber : `+91${callerNumber.replace(/\D/g, "").slice(-10)}`,
                  firstName: isInbound ? "Incoming" : "Internal",
                  lastName: isInbound ? "Caller" : "Call",
                  stageId: stage.id,
                }
              });
            } catch (errLead) {
              console.warn("Could not auto-create lead in hangup (new log):", errLead);
            }
          }
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
