import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  getPhoneVariants,
  getCoreNumber,
  resolveCallEndpoints,
} from "@/lib/telephony-utils";

/**
 * Map Bonvoice notification payload to our internal call status.
 * Per Bonvoice API docs:
 *   callType "0" = Call Initialization / Ringing
 *   callType "1" = Call Answered / Active
 *   callType "2" = Call Hangup (handled by hangup route)
 *   Status field can also be: "RINGING", "ANSWERED", "NO ANSWER", "BUSY", "FAILED"
 */
function mapBonvoiceStatus(data: any): string {
  const statusRaw = (data.Status || data.status || "").toString().toUpperCase().trim();
  const agentStatusRaw = (data.AgentStatus || data.agent_status || "").toString().toUpperCase().trim();
  
  const effectiveStatus = (statusRaw === "NONE" || !statusRaw) && agentStatusRaw && agentStatusRaw !== "NONE" ? agentStatusRaw : statusRaw;

  if (effectiveStatus === "ANSWERED") return "ANSWERED";
  if (effectiveStatus === "RINGING" || effectiveStatus === "RING") return "RINGING";
  if (effectiveStatus === "NO ANSWER" || effectiveStatus === "NOANSWER" || effectiveStatus === "NO_ANSWER") return "MISSED";
  if (effectiveStatus === "BUSY") return "MISSED";
  if (effectiveStatus === "FAILED" || effectiveStatus === "CANCEL" || effectiveStatus === "CANCELLED" || effectiveStatus === "CHANUNAVAIL") return "FAILED";

  const callType = parseInt(String(data.callType ?? data.CallType ?? ""), 10);
  if (callType === 0) return "RINGING";
  if (callType === 1) return "ANSWERED";
  if (callType === 2) return "COMPLETED";

  return "RINGING";
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

    console.log("Bonvoice Notification Webhook:", JSON.stringify(data, null, 2));

    const Direction = data.Direction || data.direction || "";
    const StartTime = data.StartTime || data.start_time || data.startTime || "";

    const directionRaw = Direction ? String(Direction).toLowerCase() : "";
    const isInbound = directionRaw === "inbound";
    const isDirectionExplicit = directionRaw !== "";

    const endpoints = resolveCallEndpoints(data, isInbound);
    let didNumber = endpoints.didNumber;
    let callerNumber = endpoints.callerNumber;
    const callID = endpoints.callID;
    const referenceId = endpoints.referenceId;
    let eventId = endpoints.eventId;
    const durationSeconds = endpoints.actualDuration;

    // Intelligent DID discovery for Postman/API/webhook calls:
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

    let mappedStatus = mapBonvoiceStatus(data);
    const isCallLive = mappedStatus === "RINGING" || mappedStatus === "ANSWERED";

    if (!isCallLive && durationSeconds === 0) {
      if (mappedStatus !== "MISSED") {
        mappedStatus = "FAILED";
      }
    }

    console.log(`Bonvoice Notification: dir=${isInbound ? "INBOUND" : "OUTBOUND"} status=${mappedStatus} DID=${didNumber} caller=${callerNumber} callID=${callID} ref=${referenceId}`);

    if (!didNumber) {
      console.log("Bonvoice Notification: No DID found, skipping.");
      return NextResponse.json({ success: true });
    }

    const didVariants  = getPhoneVariants(didNumber);
    const callerCore   = getCoreNumber(callerNumber);

    // 1. Check for existing call logs by referenceId, callID, or eventId
    let existingLogs: any[] = [];
    if (callID && typeof callID === "string" && callID.includes("xx")) {
      eventId = callID.split("xx")[0];
    }

    if (referenceId || callID || eventId) {
      existingLogs = await prisma.callLog.findMany({
        where: {
          OR: [
            ...(referenceId ? [{ id: referenceId }] : []),
            ...(callID ? [{ providerCallId: String(callID) }] : []),
            ...(eventId ? [{ callLogId: eventId }] : []),
            ...(eventId ? [{ publicId: eventId }] : [])
          ]
        },
      });
    }

    if (existingLogs.length > 0) {
      // Update ALL existing logs for this call
      for (const log of existingLogs) {
        const terminalStatuses = ["COMPLETED", "FAILED", "MISSED", "CANCELED"];
        let finalStatusToUpdate = mappedStatus;
        
        // State machine validation: don't let a live status overwrite a terminal status (out-of-order webhooks)
        if (terminalStatuses.includes(log.status) && isCallLive) {
          finalStatusToUpdate = log.status; // Keep terminal status
        }
        
        await prisma.callLog.update({
          where: { id: log.id },
          data: {
            status:     finalStatusToUpdate as any,
            answeredAt: finalStatusToUpdate === "ANSWERED" ? new Date() : undefined,
            providerCallId: String(callID),
            providerWebhook: data,
            historicalDidString: log.historicalDidString || didNumber,
            historicalChannels: log.historicalChannels || 1,
          },
        });
      }
      console.log(`Bonvoice Notification: Updated ${existingLogs.length} call logs → ${mappedStatus}`);
    } else {
      // 2. Find ALL PhoneNumbers matching this DID
      const candidates = await prisma.phoneNumber.findMany({
        where: { number: { in: didVariants } },
        include: { company: { select: { parentCompanyId: true } } },
      });

      console.log(`Bonvoice Notification: DID variants [${didVariants.join(", ")}] → ${candidates.length} candidate(s) found.`);

      if (candidates.length === 0) {
        console.warn("Bonvoice Notification: No PhoneNumber matched in DB. Attempting loose company lookup.");
        
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
              console.log(`Bonvoice Notification: Found fallback company ${fallbackCompanyId} via loose DID match`);
            }
          }
        }
        
        let parsedStartTime = new Date();
        if (StartTime) {
          const stStr = String(StartTime);
          if (stStr.includes("T")) {
            parsedStartTime = new Date(stStr);
          } else {
            parsedStartTime = new Date(`${stStr.replace(" ", "T")}+05:30`);
          }
          if (isNaN(parsedStartTime.getTime())) parsedStartTime = new Date();
        }

        await prisma.callLog.create({
          data: {
            callLogId:       `CL${Date.now()}`,
            publicId:        `bonvoice-${Date.now()}`,
            direction:       isInbound ? "INBOUND" : "OUTBOUND",
            status:          mappedStatus as any,
            companyId:       fallbackCompanyId,
            providerCallId:  callID ? String(callID) : undefined,
            startedAt:       parsedStartTime,
            answeredAt:      mappedStatus === "ANSWERED" ? new Date() : undefined,
            provider:        "BONVOICE",
            providerStatus:  mappedStatus,
            providerWebhook: data,
            historicalDidString: didNumber,
            historicalChannels: 1,
          },
        });
      } else {
        // If this is an INBOUND call, ONLY candidates assigned as INBOUND or BOTH are eligible.
        // If an outbound number of a sub-company or main company is dialed from outside,
        // and that number is NOT assigned for inbound (direction is OUTBOUND only):
        // -> do NOT link to the company, do NOT increase inbound total, do NOT charge any credits.
        //
        // IMPORTANT: Only apply this filter when direction is EXPLICITLY "inbound".
        // If direction is unknown/missing (e.g. external outbound call via Postman/API that omits Direction),
        // we must NOT drop the call — it should still be recorded as an outbound internal call.
        let filtered = candidates;
        if (isInbound && isDirectionExplicit) {
          filtered = candidates.filter(p => {
            const dir = (p.direction || "").toUpperCase();
            return dir === "INBOUND" || dir === "BOTH";
          });

          if (filtered.length === 0) {
            console.log(`Bonvoice Notification: Inbound call received on OUTBOUND-only number (${didNumber}). Dropping company association - no inbound stats increase and no credit deduction.`);
            return NextResponse.json({ success: true, message: "Ignored inbound call to outbound-only number" });
          }
        }

        const activeFiltered = filtered.filter(p => !p.status || p.status === "ACTIVE");
        const pool = activeFiltered.length > 0 ? activeFiltered : filtered;

        // Candidate priority:
        // 1. If assigned to a sub-company (explicitly delegated DID), choose sub-company
        // 2. Else parent company (company without parentCompanyId)
        // 3. Fallback to first candidate in pool
        const subCompanyCandidate = pool.find(p => p.company && (p.company as any).parentCompanyId);
        const parentCompanyCandidate = pool.find(p => p.company && !(p.company as any).parentCompanyId);
        const targetPhoneNumber = subCompanyCandidate || parentCompanyCandidate || pool[0];

        // Concurrency guard: check if already created
        if (callID) {
          const alreadyCreated = await prisma.callLog.findFirst({
            where: { providerCallId: String(callID) }
          });
          if (alreadyCreated) {
            console.log(`Bonvoice Notification: CallLog already exists for providerCallId ${callID}`);
            return NextResponse.json({ success: true });
          }
        }

        let lead: any = null;
        if (callerCore && targetPhoneNumber.companyId) {
          lead = await prisma.lead.findFirst({
            where: {
              companyId: targetPhoneNumber.companyId,
              phone:     { contains: callerCore },
            },
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
              console.warn("Could not auto-create lead in notification:", errLead);
            }
          }
        }

        let parsedStartTime = new Date();
        if (StartTime) {
          const stStr = String(StartTime);
          if (stStr.includes("T")) {
            parsedStartTime = new Date(stStr);
          } else {
            parsedStartTime = new Date(`${stStr.replace(" ", "T")}+05:30`);
          }
          if (isNaN(parsedStartTime.getTime())) parsedStartTime = new Date();
        }

        // ── NEW: Before creating a new call log, check if the platform already created
        // a PENDING/RINGING/DISPATCHING call log for the same DID + caller (when it
        // dispatched the call via Bonvoice API). If found, update it with the Bonvoice
        // callID so the hangup webhook will find and close it properly.
        // This prevents platform-initiated calls from permanently stuck in RINGING state.
        let platformLog: any = null;
        if (callerCore && targetPhoneNumber.id) {
          platformLog = await prisma.callLog.findFirst({
            where: {
              phoneNumberId: targetPhoneNumber.id,
              status: { in: ["PENDING", "RINGING", "DISPATCHING", "QUEUED", "QUEUED_AT_PROVIDER", "ANSWERED"] },
              lead: { phone: { contains: callerCore } },
            },
            orderBy: { createdAt: "desc" },
          });
          // Also try without lead constraint (manual dial or unmatched lead)
          if (!platformLog) {
            platformLog = await prisma.callLog.findFirst({
              where: {
                phoneNumberId: targetPhoneNumber.id,
                status: { in: ["PENDING", "RINGING", "DISPATCHING", "QUEUED", "QUEUED_AT_PROVIDER", "ANSWERED"] },
                leadId: null,
              },
              orderBy: { createdAt: "desc" },
            });
          }
        }

        if (platformLog) {
          // Update the existing platform-created log with the Bonvoice callID and status
          await prisma.callLog.update({
            where: { id: platformLog.id },
            data: {
              status: mappedStatus as any,
              providerCallId: callID ? String(callID) : platformLog.providerCallId,
              answeredAt: mappedStatus === "ANSWERED" ? new Date() : undefined,
              providerStatus: mappedStatus,
              providerWebhook: data,
              historicalDidString: platformLog.historicalDidString || didNumber,
              historicalChannels: platformLog.historicalChannels || 1,
            },
          });
          console.log(`Bonvoice Notification: Updated platform call log ${platformLog.id} → ${mappedStatus} (bonvoice callID: ${callID})`);
          return NextResponse.json({ success: true });
        }

        // No existing platform log found — create a new one (call initiated outside platform)
        const newLog = await prisma.callLog.create({
          data: {
            callLogId:       `CL${Date.now()}-${targetPhoneNumber.id.substring(0, 5)}`,
            publicId:        `bonvoice-${Date.now()}-${targetPhoneNumber.id.substring(0, 5)}`,
            direction:       isInbound ? "INBOUND" : "OUTBOUND",
            status:          mappedStatus as any,
            companyId:       targetPhoneNumber.companyId ?? undefined,
            phoneNumberId:   targetPhoneNumber.id,
            leadId:          lead?.id ?? undefined,
            aiAgentId:       isInbound ? (targetPhoneNumber.inboundAgentId ?? undefined) : (targetPhoneNumber.outboundAgentId ?? undefined),
            providerCallId:  callID ? String(callID) : undefined,
            startedAt:       parsedStartTime,
            answeredAt:      mappedStatus === "ANSWERED" ? new Date() : undefined,
            provider:        "BONVOICE",
            providerStatus:  mappedStatus,
            providerWebhook: data,
            historicalDidString: targetPhoneNumber.number,
            historicalChannels: targetPhoneNumber.channels || 1,
          },
        });
        console.log(`Bonvoice Notification: Created new call log ${newLog.id} status=${mappedStatus} for company=${targetPhoneNumber.companyId}`);

      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Bonvoice Notification Webhook Error:", error?.message ?? error);
    return NextResponse.json({ success: true }); // always 200 so Bonvoice doesn't retry
  }
}

export async function GET() {
  return NextResponse.json({ success: true });
}
