import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import prisma from "@/lib/prisma";

const JWT_SECRET = process.env.JWT_SECRET || "propnex_secret_jwt_key_2026_key";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// High-performance in-memory cache with 1.5-second TTL for instant realtime accuracy
const dashboardCache = new Map<string, { data: any; expiry: number }>();
const CACHE_TTL_MS = 1500;

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.split(" ")[1];
    const decoded: any = jwt.verify(token, JWT_SECRET);
    const userId = decoded.sub || decoded.id;

    const member = await (prisma as any).companyMember.findFirst({
      where: { userId, status: "ACTIVE" }
    });

    if (!member?.companyId) {
      return NextResponse.json({ data: [] });
    }

    const companyId = member.companyId;

    // Check memory cache for instant sub-millisecond response
    const cached = dashboardCache.get(companyId);
    const nowMs = Date.now();
    if (cached && cached.expiry > nowMs) {
      return NextResponse.json({ data: cached.data });
    }

    const subCompanies = await prisma.company.findMany({
      where: { parentCompanyId: companyId },
      select: { id: true }
    });
    const companyIdsToQuery = [companyId, ...subCompanies.map((c: any) => c.id)];

    // Fetch dynamic fallback number for pending calls
    const activeFallbackPhone = await prisma.phoneNumber.findFirst({
      where: {
        companyId: companyId,
        direction: { in: ["OUTBOUND", "BOTH"] },
        status: "ACTIVE",
      },
      select: { number: true, channels: true }
    });
    const fallbackNumber = activeFallbackPhone?.number || "Unknown";
    const fallbackChannels = activeFallbackPhone?.channels || 1;

    // Fetch original failed/missed outbound calls (LEAN PROJECTION for blazing speed)
    const failedCalls = await prisma.callLog.findMany({
      where: {
        companyId: { in: companyIdsToQuery },
        direction: "OUTBOUND",
        OR: [
          { status: { in: ["FAILED", "MISSED", "BUSY", "NO_ANSWER", "CANCELLED"] } },
          { durationSeconds: 0 },
        ],
        NOT: {
          AND: [
            { correlationId: { isSet: true } },
            { correlationId: { startsWith: "reactivation-" } }
          ]
        }
      },
      select: {
        id: true,
        callLogId: true,
        publicId: true,
        startedAt: true,
        leadId: true,
        campaignId: true,
        correlationId: true,
        providerCallId: true,
        providerWebhook: true,
        status: true,
        durationSeconds: true,
        lead: {
          select: {
            id: true,
            phone: true,
            firstName: true,
            lastName: true,
            customFields: true,
          }
        },
        phoneNumber: {
          select: {
            number: true,
            channels: true,
          }
        }
      },
      orderBy: {
        startedAt: "asc"
      }
    });

    // Fetch reactivation CallLogs to track Q1/Q2/Q3 progress
    const reactivationLogs = await prisma.callLog.findMany({
      where: {
        companyId: { in: companyIdsToQuery },
        direction: "OUTBOUND",
        correlationId: { startsWith: "reactivation-" }
      },
      select: {
        id: true,
        leadId: true,
        status: true,
        correlationId: true,
        durationSeconds: true,
        startedAt: true,
        lead: {
          select: { phone: true }
        }
      }
    });

    // Build fast lookup Map for reactivation logs by phone and leadId
    const reactivationLogsByPhone = new Map<string, any[]>();
    const reactivationLogsByLeadId = new Map<string, any[]>();
    for (const log of reactivationLogs) {
      if (log.lead?.phone) {
        const phone = log.lead.phone;
        const list = reactivationLogsByPhone.get(phone) || [];
        list.push(log);
        reactivationLogsByPhone.set(phone, list);

        const corePhone = phone.replace(/\D/g, "").slice(-10);
        if (corePhone && corePhone !== phone) {
          const coreList = reactivationLogsByPhone.get(corePhone) || [];
          coreList.push(log);
          reactivationLogsByPhone.set(corePhone, coreList);
        }
      }
      if (log.leadId) {
        const list = reactivationLogsByLeadId.get(log.leadId) || [];
        list.push(log);
        reactivationLogsByLeadId.set(log.leadId, list);
      }
    }

    const LIVE_STATUSES = ["RINGING", "IN-PROGRESS", "DISPATCHING", "QUEUED_AT_PROVIDER", "ANSWERED"];

    const buckets: Record<string, any> = {};
    let currentKey = "";
    const seenPhones = new Set<string>();

    const istFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });

    for (const call of failedCalls) {
      const d = call.startedAt;

      // Group by calendar day in IST (UTC+5:30)
      const key = istFmt.format(d); // "YYYY-MM-DD"

      if (key !== currentKey) {
        currentKey = key;
        seenPhones.clear();
      }

      const wh: any = (call as any).providerWebhook || {};
      const fallbackPhone =
        wh.DestinationNumber ||
        wh.callingNo ||
        wh.dstNum ||
        wh.destination ||
        (call.providerCallId && call.providerCallId.includes("-") ? call.providerCallId.split("-")[2] : "");
      const rawPhone = call.lead?.phone || fallbackPhone || "";
      const leadPhone = rawPhone ? (rawPhone.startsWith("+") ? rawPhone : `+91${rawPhone.replace(/\D/g, "").slice(-10)}`) : null;
      if (!leadPhone) continue;
      const corePhone = leadPhone.replace(/\D/g, "").slice(-10);
      if (corePhone.length < 10) continue;

      // Deduplicate phone per day by core 10 digits
      if (seenPhones.has(corePhone)) continue;
      seenPhones.add(corePhone);

      if (!buckets[key]) {
        const nextDayMs = d.getTime() + 24 * 60 * 60 * 1000;
        const shortFmtOptions: Intl.DateTimeFormatOptions = { timeZone: "Asia/Kolkata", day: "2-digit", month: "short" };
        const shortFmt = new Intl.DateTimeFormat("en-GB", shortFmtOptions).format(d);
        const nextShortFmt = new Intl.DateTimeFormat("en-GB", shortFmtOptions).format(new Date(nextDayMs));

        const nextDayStr = istFmt.format(new Date(nextDayMs)); // "YYYY-MM-DD"

        // Exact wave scheduled times and cutoffs in IST:
        // Wave 1: 10:00 AM -> 2:30 PM cutoff (stops at 2:30 PM, 30 min calculation window)
        // Wave 2: 3:00 PM  -> 7:30 PM cutoff (stops at 7:30 PM, 30 min calculation window)
        // Wave 3: 8:00 PM  -> No stop / runs until done
        const q1Time = new Date(`${nextDayStr}T10:00:00+05:30`);
        const q1CutoffTime = new Date(`${nextDayStr}T14:30:00+05:30`);
        const q2Time = new Date(`${nextDayStr}T15:00:00+05:30`);
        const q2CutoffTime = new Date(`${nextDayStr}T19:30:00+05:30`);
        const q3Time = new Date(`${nextDayStr}T20:00:00+05:30`);

        const numStillActive = call.phoneNumber !== null;
        const didToShow = numStillActive ? call.phoneNumber!.number : fallbackNumber;
        const chToShow = numStillActive ? (call.phoneNumber!.channels || fallbackChannels) : fallbackChannels;

        buckets[key] = {
          id: key,
          csvName: `${shortFmt} Failed Leads`,
          didNumber: didToShow,
          channels: chToShow,
          date: shortFmt,
          originalDateMs: d.getTime(),
          q1Time, q1CutoffTime,
          q2Time, q2CutoffTime,
          q3Time,
          q1: { label: "Wave 1", scheduled: `${nextShortFmt} 10 Am`, status: "Pending", failedLeads: [] },
          q2: { label: "Wave 2", scheduled: `${nextShortFmt} 3 Pm`, status: "Pending", failedLeads: [] },
          q3: { label: "Wave 3", scheduled: `${nextShortFmt} 8 Pm`, status: "Pending", failedLeads: [] },
        };
      } else {
        const currentDid = call.phoneNumber?.number;
        if (currentDid && buckets[key].didNumber !== currentDid) {
          buckets[key].didNumber = "Multiple Numbers";
        }
      }

      const leadId = call.leadId || `manual-${leadPhone}`;
      if (!buckets[key].q1.failedLeads.find((l: any) => l.phone === leadPhone)) {
        let leadName = "Unknown";
        if (call.lead) {
          if (call.lead.firstName || call.lead.lastName) {
            leadName = `${call.lead.firstName || ""} ${call.lead.lastName || ""}`.trim();
          } else if ((call.lead as any).name) {
            leadName = (call.lead as any).name;
          } else if (call.lead.customFields) {
            try {
              const custom = typeof call.lead.customFields === 'string' ? JSON.parse(call.lead.customFields) : call.lead.customFields;
              if (custom.Name || custom.name) leadName = custom.Name || custom.name;
            } catch (e) { }
          }
        }

        // Determine original call type generically for all companies:
        // - Campaign: has campaignId OR correlationId starts with 'camp-' OR Bonvoice OBD
        // - Internal: callLogId starts with 'CL' without campaign/reactivation, or publicId starts with 'bonvoice-', or no leadId
        // - Lead: manual direct call placed to a known lead
        const pCId = (call as any).providerCallId || "";
        const pubId = (call as any).publicId || "";
        const cLogId = (call as any).callLogId || "";

        const isInternal =
          Boolean(pubId.startsWith("bonvoice-")) ||
          Boolean(cLogId.startsWith("CL") && !call.campaignId && !call.correlationId) ||
          Boolean(!call.leadId && !call.campaignId && !call.correlationId);

        const isCampaign =
          Boolean(call.campaignId) ||
          Boolean(call.correlationId && call.correlationId.startsWith("camp-")) ||
          Boolean(wh.callType === "2" && call.leadId && !pCId.startsWith("OUT-") && !pCId.startsWith("pending-") && !isInternal);

        const originalCallType = isCampaign
          ? "Campaign"
          : isInternal
            ? "Internal"
            : "Lead";

        const numStillActive2 = call.phoneNumber !== null;
        const didToShow2 = numStillActive2 ? call.phoneNumber!.number : fallbackNumber;
        const chToShow2 = numStillActive2 ? (call.phoneNumber!.channels || fallbackChannels) : fallbackChannels;

        buckets[key].q1.failedLeads.push({
          id: leadId,
          name: leadName,
          phone: leadPhone,
          didNumber: didToShow2,
          channels: chToShow2,
          isCompleted: false,
          originalCallType
        });
      }
    }

    const compShort = companyId.replace(/-/g, "").slice(0, 8);

    const todayIstStr = istFmt.format(new Date(nowMs));

    // Process Q1, Q2, Q3 stages and rollover
    for (const key of Object.keys(buckets)) {
      const b = buckets[key];
      const correlationPrefix = `reactivation-${key}-${compShort}-`;

      const matchLegacy = (log: any, suffix: string, expectedTime: Date) => {
        if (!log.correlationId?.endsWith(suffix)) return false;
        if (log.correlationId?.match(/reactivation-\d{4}-\d{2}-\d{2}-/)) return false;
        const logDate = new Date(log.startedAt).toISOString().split('T')[0];
        const expectedDate = expectedTime.toISOString().split('T')[0];
        return logDate === expectedDate;
      };

      const q1Logs = reactivationLogs.filter(
        l => (l.correlationId?.startsWith(correlationPrefix) && l.correlationId?.endsWith("-q1")) ||
             (b.q1.failedLeads.some((fl: any) => fl.id === l.leadId) && matchLegacy(l, "-q1", b.q1Time))
      );
      const q2Logs = reactivationLogs.filter(
        l => (l.correlationId?.startsWith(correlationPrefix) && l.correlationId?.endsWith("-q2")) ||
             (b.q1.failedLeads.some((fl: any) => fl.id === l.leadId) && matchLegacy(l, "-q2", b.q2Time))
      );
      const q3Logs = reactivationLogs.filter(
        l => (l.correlationId?.startsWith(correlationPrefix) && l.correlationId?.endsWith("-q3")) ||
             (b.q1.failedLeads.some((fl: any) => fl.id === l.leadId) && matchLegacy(l, "-q3", b.q3Time))
      );

      // Check if any call is currently ringing/active in each wave
      const q1Running = q1Logs.some(l => LIVE_STATUSES.includes(l.status?.toUpperCase() || ""));
      const q2Running = q2Logs.some(l => LIVE_STATUSES.includes(l.status?.toUpperCase() || ""));
      const q3Running = q3Logs.some(l => LIVE_STATUSES.includes(l.status?.toUpperCase() || ""));

      const hasQ1Attempted = q1Logs.length > 0;
      const hasQ2Attempted = q2Logs.length > 0;
      const hasQ3Attempted = q3Logs.length > 0;

      const getLatestCallMs = (logs: any[]) =>
        logs.reduce((max, l) => {
          const t = l.startedAt ? new Date(l.startedAt).getTime() : 0;
          return t > max ? t : max;
        }, 0);

      const q1QuietMs = hasQ1Attempted ? (nowMs - getLatestCallMs(q1Logs)) : 0;
      const q2QuietMs = hasQ2Attempted ? (nowMs - getLatestCallMs(q2Logs)) : 0;
      const q3QuietMs = hasQ3Attempted ? (nowMs - getLatestCallMs(q3Logs)) : 0;

      // Reactivation day is the day following the original failed leads day
      const reactivationDateStr = istFmt.format(new Date(b.originalDateMs + 24 * 60 * 60 * 1000));
      const isPastDay = reactivationDateStr < todayIstStr;
      const q3CutoffTime = new Date(`${reactivationDateStr}T23:45:00+05:30`);
      const isPastQ3Cutoff = isPastDay || (nowMs >= q3CutoffTime.getTime());
      const isPastQ1Cutoff = isPastDay || (nowMs >= b.q1CutoffTime.getTime());
      const isPastQ2Cutoff = isPastDay || (nowMs >= b.q2CutoffTime.getTime());

      // Fast set of attempted phones for Wave 1 to check if all leads have been attempted
      const q1AttemptedPhones = new Set(
        q1Logs.map(l => l.lead?.phone?.replace(/\D/g, "").slice(-10)).filter(Boolean)
      );
      const allQ1Attempted = b.q1.failedLeads.length > 0 && b.q1.failedLeads.every((fl: any) => {
        const core = (fl.phone || "").replace(/\D/g, "").slice(-10);
        return q1AttemptedPhones.has(core) || q1Logs.some(l => l.leadId === fl.id);
      });

      // Wave 1 (Q1 - 10:00 AM IST scheduled, 2:30 PM IST cutoff):
      // A wave is Completed ONLY IF:
      // 1. Cutoff time (2:30 PM IST) or past day has arrived
      // 2. OR: ALL leads in Wave 1 have actually been dialed to completion (no ringing calls remaining)
      const q1Finished = isPastQ1Cutoff || (allQ1Attempted && !q1Running);

      if (q1Finished) {
        b.q1.status = "Completed";
      } else if (nowMs < b.q1Time.getTime() && !hasQ1Attempted) {
        b.q1.status = "Pending";
      } else {
        b.q1.status = "Running";
      }

      // STRICT TIMING: Wave 2 ONLY calculates AFTER 2:30 PM cutoff (or past day, or Wave 1 Completed)
      const canRolloverToQ2 = isPastDay || isPastQ1Cutoff || b.q1.status === "Completed";
      // STRICT TIMING: Wave 3 ONLY calculates AFTER 7:30 PM cutoff (or past day, or Wave 2 Completed)
      const canRolloverToQ3 = isPastDay || isPastQ2Cutoff || b.q2.status === "Completed";

      // Fast set of attempted phones for Wave 2
      const q2AttemptedPhones = new Set(
        q2Logs.map(l => l.lead?.phone?.replace(/\D/g, "").slice(-10)).filter(Boolean)
      );

      // Fast set of attempted phones for Wave 3
      const q3AttemptedPhones = new Set(
        q3Logs.map(l => l.lead?.phone?.replace(/\D/g, "").slice(-10)).filter(Boolean)
      );

      const q1FinalList: any[] = [];
      const q2FinalList: any[] = [];
      const q3FinalList: any[] = [];

      // ── Process Wave 1 Leads ──
      for (const lead of b.q1.failedLeads) {
        const corePhone = (lead.phone || "").replace(/\D/g, "").slice(-10);
        const leadLogsByPhone = [
          ...(reactivationLogsByPhone.get(lead.phone) || []),
          ...(corePhone && corePhone !== lead.phone ? (reactivationLogsByPhone.get(corePhone) || []) : [])
        ];
        const leadLogsById = reactivationLogsByLeadId.get(lead.id) || [];
        const leadLogs = [...new Set([...leadLogsByPhone, ...leadLogsById])];

        let q1Log = leadLogs.find(l => l.correlationId?.startsWith(correlationPrefix) && l.correlationId?.endsWith("-q1")) || leadLogs.find(l => matchLegacy(l, "-q1", b.q1Time));
        let q2Log = leadLogs.find(l => l.correlationId?.startsWith(correlationPrefix) && l.correlationId?.endsWith("-q2")) || leadLogs.find(l => matchLegacy(l, "-q2", b.q2Time));
        let q3Log = leadLogs.find(l => l.correlationId?.startsWith(correlationPrefix) && l.correlationId?.endsWith("-q3")) || leadLogs.find(l => matchLegacy(l, "-q3", b.q3Time));

        if (nowMs < b.q1Time.getTime() && !isPastDay && !hasQ1Attempted) q1Log = undefined;
        if (nowMs < b.q2Time.getTime() && !isPastDay && !hasQ2Attempted) q2Log = undefined;
        if (nowMs < b.q3Time.getTime() && !isPastDay && !hasQ3Attempted) q3Log = undefined;

        const q1LogStatus = (q1Log?.status || "").toUpperCase();
        const completedInQ1 = q1LogStatus === "COMPLETED" && (q1Log?.durationSeconds || 0) > 0;
        const q1LogAgeMs = q1Log?.startedAt ? (nowMs - new Date(q1Log.startedAt).getTime()) : 0;
        // Stale: pending for more than 15 minutes (was 5 min — too aggressive, killed live calls)
        const q1IsStalePending = !!q1Log && LIVE_STATUSES.includes(q1LogStatus) && q1LogAgeMs > 15 * 60 * 1000;
        if (q1IsStalePending && q1Log?.id) {
          prisma.callLog.update({ where: { id: q1Log.id }, data: { status: "FAILED", durationSeconds: 0 } }).catch(() => {});
        }
        const isRingingInQ1 = !completedInQ1 && !isPastDay && !!q1Log && LIVE_STATUSES.includes(q1LogStatus) && !q1IsStalePending;

        // If Wave 1 is Completed (past 2:30 PM cutoff or all dialed), non-completed leads are marked failed for Wave 1.
        // If Wave 1 is still Running (between 10:00 AM and 2:30 PM), ONLY leads actually attempted and failed are failed;
        // unattempted leads remain PENDING.
        const isAttemptedQ1 = !!q1Log;
        const failedInQ1 = b.q1.status === "Completed"
          ? !completedInQ1
          : (!completedInQ1 && !isRingingInQ1 && (q1IsStalePending || (isAttemptedQ1 && ["FAILED", "MISSED", "BUSY", "NO_ANSWER", "CANCELLED"].includes(q1LogStatus))));

        const leadQ1Data = {
          ...lead,
          isCompleted: completedInQ1,
          isFailed: failedInQ1,
          isRinging: isRingingInQ1,
          isAttempted: isAttemptedQ1,
          status: completedInQ1 ? "COMPLETED" : (isRingingInQ1 ? "RINGING" : (failedInQ1 ? "FAILED" : (isAttemptedQ1 ? q1LogStatus : "PENDING"))),
        };
        q1FinalList.push(leadQ1Data);

        // ── Rollover to Wave 2: All leads that did not succeed in Wave 1 ──
        if (!completedInQ1 && canRolloverToQ2) {
          const q2LogStatus = (q2Log?.status || "").toUpperCase();
          const completedInQ2 = q2LogStatus === "COMPLETED" && (q2Log?.durationSeconds || 0) > 0;
          const q2LogAgeMs = q2Log?.startedAt ? (nowMs - new Date(q2Log.startedAt).getTime()) : 0;
          const q2IsStalePending = !!q2Log && LIVE_STATUSES.includes(q2LogStatus) && q2LogAgeMs > 15 * 60 * 1000;
          if (q2IsStalePending && q2Log?.id) {
            prisma.callLog.update({ where: { id: q2Log.id }, data: { status: "FAILED", durationSeconds: 0 } }).catch(() => {});
          }
          const isRingingInQ2 = !completedInQ2 && !isPastDay && !!q2Log && LIVE_STATUSES.includes(q2LogStatus) && !q2IsStalePending;

          const isAttemptedQ2 = !!q2Log;
          const failedInQ2 = isPastQ2Cutoff
            ? !completedInQ2
            : (!completedInQ2 && !isRingingInQ2 && (q2IsStalePending || (isAttemptedQ2 && ["FAILED", "MISSED", "BUSY", "NO_ANSWER", "CANCELLED"].includes(q2LogStatus))));

          const leadQ2Data = {
            ...lead,
            isCompleted: completedInQ2,
            isFailed: failedInQ2,
            isRinging: isRingingInQ2,
            isAttempted: isAttemptedQ2,
            status: completedInQ2 ? "COMPLETED" : (isRingingInQ2 ? "RINGING" : (failedInQ2 ? "FAILED" : (isAttemptedQ2 ? q2LogStatus : "PENDING"))),
          };
          q2FinalList.push(leadQ2Data);

          // ── Rollover to Wave 3: All leads that did not succeed in Wave 2 ──
          if (!completedInQ2 && canRolloverToQ3) {
            const q3LogStatus = (q3Log?.status || "").toUpperCase();
            const completedInQ3 = q3LogStatus === "COMPLETED" && (q3Log?.durationSeconds || 0) > 0;
            const q3LogAgeMs = q3Log?.startedAt ? (nowMs - new Date(q3Log.startedAt).getTime()) : 0;
            const q3IsStalePending = !!q3Log && LIVE_STATUSES.includes(q3LogStatus) && q3LogAgeMs > 15 * 60 * 1000;
            if (q3IsStalePending && q3Log?.id) {
              prisma.callLog.update({ where: { id: q3Log.id }, data: { status: "FAILED", durationSeconds: 0 } }).catch(() => {});
            }
            const isRingingInQ3 = !completedInQ3 && !isPastQ3Cutoff && !!q3Log && LIVE_STATUSES.includes(q3LogStatus) && !q3IsStalePending;

            const isAttemptedQ3 = !!q3Log;
            const failedInQ3 = isPastQ3Cutoff
              ? !completedInQ3
              : (!completedInQ3 && !isRingingInQ3 && (q3IsStalePending || (isAttemptedQ3 && ["FAILED", "MISSED", "BUSY", "NO_ANSWER", "CANCELLED"].includes(q3LogStatus))));

            const leadQ3Data = {
              ...lead,
              isCompleted: completedInQ3,
              isFailed: failedInQ3,
              isRinging: isRingingInQ3,
              isAttempted: isAttemptedQ3,
              status: completedInQ3 ? "COMPLETED" : (isRingingInQ3 ? "RINGING" : (failedInQ3 ? "FAILED" : (isAttemptedQ3 ? q3LogStatus : "PENDING"))),
            };
            q3FinalList.push(leadQ3Data);
          }
        }
      }

      // Wave 2 Status Evaluation (3:00 PM IST scheduled, 7:30 PM IST cutoff)
      if (!canRolloverToQ2) {
        b.q2.status = "Pending";
      } else {
        const allQ2Attempted = q2FinalList.length > 0 && q2FinalList.every((fl: any) => {
          const core = (fl.phone || "").replace(/\D/g, "").slice(-10);
          return q2AttemptedPhones.has(core) || q2Logs.some(l => l.leadId === fl.id);
        });
        const q2Finished = isPastQ2Cutoff || (allQ2Attempted && !q2Running);

        if (q2Finished) {
          b.q2.status = "Completed";
        } else if (nowMs < b.q2Time.getTime() && !hasQ2Attempted) {
          b.q2.status = "Pending";
        } else {
          b.q2.status = "Running";
        }
      }

      // Wave 3 Status Evaluation (8:00 PM IST scheduled, 11:45 PM IST cutoff)
      if (!canRolloverToQ3) {
        b.q3.status = "Pending";
      } else {
        const allQ3Attempted = q3FinalList.length > 0 && q3FinalList.every((fl: any) => {
          const core = (fl.phone || "").replace(/\D/g, "").slice(-10);
          return q3AttemptedPhones.has(core) || q3Logs.some(l => l.leadId === fl.id);
        });
        const q3Finished = isPastQ3Cutoff || (allQ3Attempted && !q3Running);

        if (q3Finished) {
          b.q3.status = "Completed";
        } else if (nowMs < b.q3Time.getTime() && !hasQ3Attempted) {
          b.q3.status = "Pending";
        } else {
          b.q3.status = "Running";
        }
      }

      // Check if all leads are completed in Wave 1
      if (b.q1.status === "Running" && q1FinalList.length > 0) {
        const allQ1Done = q1FinalList.every(l => l.isCompleted || l.isFailed);
        if (allQ1Done) {
          b.q1.status = "Completed";
        }
      }

      // Check if all leads are completed in Wave 2
      if (b.q2.status === "Running" && q2FinalList.length > 0) {
        const allQ2Done = q2FinalList.every(l => l.isCompleted || l.isFailed);
        if (allQ2Done) {
          b.q2.status = "Completed";
        }
      }

      // Check if all leads are completed in Wave 3
      if (b.q3.status === "Running" && q3FinalList.length > 0) {
        const allQ3Done = q3FinalList.every(l => l.isCompleted || l.isFailed);
        if (allQ3Done || isPastQ3Cutoff) {
          b.q3.status = "Completed";
        }
      }

      // When a wave is marked Completed, ensure every non-completed lead is marked as failed/unreached so stats balance perfectly
      if (b.q1.status === "Completed") {
        for (const l of q1FinalList) {
          if (!l.isCompleted) {
            l.isFailed = true;
            l.isRinging = false;
            l.status = "FAILED";
          }
        }
      }
      if (b.q2.status === "Completed") {
        for (const l of q2FinalList) {
          if (!l.isCompleted) {
            l.isFailed = true;
            l.isRinging = false;
            l.status = "FAILED";
          }
        }
      }
      if (b.q3.status === "Completed") {
        for (const l of q3FinalList) {
          if (!l.isCompleted) {
            l.isFailed = true;
            l.isRinging = false;
            l.status = "FAILED";
          }
        }
      }

      // STRICT USER REQUIREMENT SORTING:
      // 1st: Running / Ringing call at top!
      // 2nd: Success (completed) calls!
      // 3rd: Failed calls!
      // 4th: Pending calls!
      const sortWave = (list: any[]) => {
        const getScore = (l: any) => {
          const status = (l.status || "").toUpperCase();
          const isRinging = l.isRinging || LIVE_STATUSES.includes(status);
          if (isRinging) return 4;        // 1st: Running/Ringing call at TOP
          if (l.isCompleted) return 3;    // 2nd: Success
          if (l.isFailed) return 2;       // 3rd: Failed
          return 1;                       // 4th: Pending
        };
        return list.sort((a, b) => getScore(b) - getScore(a));
      };

      b.q1.failedLeads = sortWave(q1FinalList);
      b.q2.failedLeads = sortWave(q2FinalList);
      b.q3.failedLeads = sortWave(q3FinalList);

      // Auto-complete wave if 0 failed leads rolled over from earlier wave (ONLY after cutoff arrived and canRollover is true)
      if (canRolloverToQ2 && b.q1.status === "Completed" && q2FinalList.length === 0) {
        b.q2.status = "Completed";
      }
      if (canRolloverToQ3 && b.q2.status === "Completed" && q3FinalList.length === 0) {
        b.q3.status = "Completed";
      }

      // Overall status
      if (b.q3.status === "Completed") {
        b.overallStatus = "Completed";
      } else {
        b.overallStatus =
          b.q1.status === "Running" || b.q2.status === "Running" || b.q3.status === "Running"
            ? "Running"
            : b.q1.status === "Pending"
              ? "Pending Q1"
              : b.q2.status === "Pending"
                ? "Pending Q2"
                : "Pending Q3";
      }
    }

    const data = Object.values(buckets).sort((a: any, b: any) => b.originalDateMs - a.originalDateMs);

    // Clean internal properties before sending response
    for (const b of data) {
      delete b.q1Time;
      delete b.q1CutoffTime;
      delete b.q2Time;
      delete b.q2CutoffTime;
      delete b.q3Time;
      delete b.originalDateMs;
    }

    // Cache in memory for 10 seconds
    dashboardCache.set(companyId, {
      data,
      expiry: Date.now() + CACHE_TTL_MS
    });

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Failed to fetch reactivation dashboard data:", error);
    return NextResponse.json({ message: "Internal server error", data: [] }, { status: 500 });
  }
}
