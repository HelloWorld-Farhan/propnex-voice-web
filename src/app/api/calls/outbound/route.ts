import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import prisma from "@/lib/prisma";
import {
  getCoreNumber,
  cleanPhone,
  determineCallType,
  calculateTelephonyCredits,
  normalizeCallStatus,
} from "@/lib/telephony-utils";

const JWT_SECRET = process.env.JWT_SECRET || "propnex_secret_jwt_key_2026_key";
export const dynamic = "force-dynamic";
export const revalidate = 0;

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
      where: { userId, status: "ACTIVE" },
    });

    if (!member?.companyId) {
      return NextResponse.json({ data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 1 } });
    }

    const { searchParams } = new URL(req.url);
    const targetCompanyId = searchParams.get("companyId");

    let companyIdsToQuery = [member.companyId];
    let freshStartAfter: Date | null = null;

    if (targetCompanyId && targetCompanyId !== member.companyId) {
      const subCompany = await (prisma.company.findFirst as any)({
        where: { id: targetCompanyId, parentCompanyId: member.companyId },
        include: { phoneNumbers: { select: { createdAt: true }, take: 1, orderBy: { createdAt: "asc" } } },
      });
      if (subCompany) {
        companyIdsToQuery = [targetCompanyId];
        const earliestAssignment = (subCompany as any).phoneNumbers?.[0]?.createdAt;
        if (earliestAssignment) freshStartAfter = new Date(earliestAssignment);
      }
    } else {
      const subCompanies = await prisma.company.findMany({
        where: { parentCompanyId: member.companyId },
        select: { id: true },
      });
      companyIdsToQuery = [member.companyId, ...subCompanies.map((c: any) => c.id)];
    }

    // Single query to discover all DIDs associated with the queried companies
    const companyPhoneNumbers = await prisma.phoneNumber.findMany({
      where: { companyId: { in: companyIdsToQuery } },
      select: { id: true, number: true },
    });
    const companyPhoneIds = companyPhoneNumbers.map((p: any) => p.id);
    const companyNumberCores = companyPhoneNumbers.map((p: any) => getCoreNumber(p.number)).filter(Boolean);

    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "10", 10);
    const skip = (page - 1) * limit;

    const assignedNumber = searchParams.get("assignedNumber");
    const callerNumber = searchParams.get("callerNumber");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const minDuration = searchParams.get("minDuration");
    const durationUnit = searchParams.get("durationUnit") || "sec";
    const search = searchParams.get("search");
    const statusParam = searchParams.get("status");
    const sortBy = searchParams.get("sortBy") || "date";
    const sortOrder = (searchParams.get("sortOrder") || "desc").toLowerCase() === "asc" ? "asc" : "desc";

    const getWhereClause = () => {
      const whereClause: any = {
        direction: "OUTBOUND",
        OR: [
          { companyId: { in: companyIdsToQuery } },
          ...(companyPhoneIds.length > 0 ? [{ phoneNumberId: { in: companyPhoneIds } }] : []),
          ...(companyNumberCores.length > 0 ? companyNumberCores.map((c: string) => ({ historicalDidString: { contains: c } })) : []),
        ],
      };

      if (statusParam && statusParam.toLowerCase() !== "all") {
        const s = statusParam.toUpperCase();
        if (s === "COMPLETED") {
          whereClause.status = "COMPLETED";
        } else if (s === "FAILED") {
          whereClause.status = { in: ["FAILED", "CANCELLED"] };
        } else if (s === "MISSED") {
          whereClause.status = { in: ["MISSED", "NO_ANSWER", "BUSY", "VOICEMAIL"] };
        } else if (s === "RINGING") {
          whereClause.status = { in: ["RINGING", "DISPATCHING", "QUEUED", "QUEUED_AT_PROVIDER", "PENDING"] };
        } else if (s === "ANSWERED") {
          whereClause.status = "ANSWERED";
        } else {
          whereClause.status = s;
        }
      }

      const andConditions: any[] = [];

      if (assignedNumber) {
        const core = getCoreNumber(assignedNumber);
        if (core) {
          andConditions.push({
            OR: [
              { phoneNumber: { number: { contains: core } } },
              { historicalDidString: { contains: core } },
              { providerCallId: { contains: core } },
            ],
          });
        }
      }

      if (callerNumber) {
        const core = getCoreNumber(callerNumber);
        if (core) {
          andConditions.push({
            OR: [
              { lead: { phone: { contains: core } } },
              { providerCallId: { contains: core } },
            ],
          });
        }
      }

      if (dateFrom || dateTo || freshStartAfter) {
        whereClause.startedAt = {};
        if (freshStartAfter) whereClause.startedAt.gte = freshStartAfter;
        if (dateFrom) {
          const fromDate = new Date(dateFrom);
          if (!isNaN(fromDate.getTime())) {
            fromDate.setHours(0, 0, 0, 0);
            whereClause.startedAt.gte = fromDate;
          }
        }
        if (dateTo) {
          const toDate = new Date(dateTo);
          if (!isNaN(toDate.getTime())) {
            toDate.setHours(23, 59, 59, 999);
            whereClause.startedAt.lte = toDate;
          }
        }
      }

      if (minDuration) {
        let minSec = parseFloat(minDuration);
        if (!isNaN(minSec)) {
          if (durationUnit === "min") {
            minSec = minSec * 60;
          }
          whereClause.durationSeconds = { gte: Math.round(minSec) };
        }
      }

      if (search) {
        const core = getCoreNumber(search) || search;
        andConditions.push({
          OR: [
            { lead: { phone: { contains: core } } },
            { phoneNumber: { number: { contains: core } } },
            { historicalDidString: { contains: core } },
            { providerCallId: { contains: core } },
            { callLogId: { contains: core } },
          ],
        });
      }

      // STRICT USER REQUIREMENT:
      // Outbound Call Logs table must ONLY show COMPLETED lead calls (duration > 0 and credits deducted).
      // Failed, missed, or in-progress LEAD reactivation calls belong exclusively in the Lead Reactivation dashboard.
      andConditions.push({
        OR: [
          { correlationId: null },
          { NOT: { correlationId: { startsWith: "reactivation-" } } },
          {
            AND: [
              { correlationId: { startsWith: "reactivation-" } },
              { status: "COMPLETED" },
              { durationSeconds: { gt: 0 } },
            ],
          },
        ],
      });

      if (andConditions.length > 0) {
        whereClause.AND = andConditions;
      }

      return whereClause;
    };

    const whereClause = getWhereClause();
    const prismaOrderBy: any = sortBy === "duration"
      ? { durationSeconds: sortOrder }
      : { startedAt: sortOrder };

    // STRICT REQUIREMENT: Ringing / active calls must ONLY be prepended on Page 1.
    // On Page 2, 3, etc., live calls are not prepended, displaying pure historical page data.
    const shouldIncludeLive = page === 1 && (!statusParam || statusParam.toLowerCase() === "all" || statusParam.toLowerCase() === "ringing" || statusParam.toLowerCase() === "answered");
    const liveOutboundWhere: any = {
      direction: "OUTBOUND",
      OR: [
        { companyId: { in: companyIdsToQuery } },
        ...(companyPhoneIds.length > 0 ? [{ phoneNumberId: { in: companyPhoneIds } }] : []),
        ...(companyNumberCores.length > 0 ? companyNumberCores.map((c: string) => ({ historicalDidString: { contains: c } })) : []),
      ],
      NOT: [
        { correlationId: { startsWith: "reactivation-" } }
      ],
      status: { in: ["RINGING", "ANSWERED", "DISPATCHING", "QUEUED", "QUEUED_AT_PROVIDER", "PENDING"] },
    };

    const [total, calls, liveCalls] = await Promise.all([
      prisma.callLog.count({ where: whereClause }),
      prisma.callLog.findMany({
        where: whereClause,
        orderBy: prismaOrderBy,
        skip,
        take: limit,
        include: {
          phoneNumber: true,
          lead: true,
          campaign: { include: { phoneNumbers: { take: 1 } } },
          company: { include: { phoneNumbers: { where: { direction: { in: ["OUTBOUND", "BOTH"] } }, take: 1 } } },
        },
      }),
      shouldIncludeLive
        ? prisma.callLog.findMany({
            where: liveOutboundWhere,
            orderBy: { startedAt: "desc" },
            take: 20,
            include: {
              phoneNumber: true,
              lead: true,
              campaign: { include: { phoneNumbers: { take: 1 } } },
              company: { include: { phoneNumbers: { where: { direction: { in: ["OUTBOUND", "BOTH"] } }, take: 1 } } },
            },
          })
        : Promise.resolve([]),
    ]);

    // Merge: live calls at top, deduplicate by id so a call never appears twice
    const seenIds = new Set<string>();
    const mergedCalls: any[] = [];
    for (const c of [...liveCalls, ...calls]) {
      if (!seenIds.has(c.id)) {
        seenIds.add(c.id);
        mergedCalls.push(c);
      }
    }

    const mappedCalls = mergedCalls.map((call) => {
      let fallbackAssignedNumber = "";
      let fallbackCustomerNumber = "";

      if (call.providerWebhook && typeof call.providerWebhook === "object") {
        const wh: any = call.providerWebhook;
        fallbackAssignedNumber =
          cleanPhone(wh.DisplayNumber || wh.display_number || wh.displayNumber) ||
          cleanPhone(wh.SourceNumber || wh.source_number || wh.sourceNumber) ||
          cleanPhone(wh.did || wh.agentNumber || wh.did_number || wh.didNumber) ||
          cleanPhone(wh.message?.call?.agent?.number || wh.call?.agent?.number) || "";

        fallbackCustomerNumber =
          cleanPhone(wh.DestinationNumber || wh.destination_number || wh.destinationNumber) ||
          cleanPhone(wh.caller || wh.to_number || wh.to) ||
          cleanPhone(wh.customer_number || wh.customerNumber) || "";

        const callIdRaw = cleanPhone(wh.callID || wh.callId || wh.call_id || wh.uuid);
        if (!fallbackAssignedNumber && callIdRaw.includes("-")) {
          const parts = callIdRaw.split("-");
          if (parts.length >= 3) fallbackAssignedNumber = cleanPhone(parts[1]);
        }
        if (!fallbackCustomerNumber && callIdRaw.includes("-")) {
          const parts = callIdRaw.split("-");
          if (parts.length >= 3) fallbackCustomerNumber = cleanPhone(parts[2]);
        }
      }

      if ((!fallbackAssignedNumber || !fallbackCustomerNumber) && call.providerCallId && call.providerCallId.includes("-")) {
        const parts = call.providerCallId.split("-");
        if (!fallbackAssignedNumber && parts.length >= 3) fallbackAssignedNumber = cleanPhone(parts[1]);
        if (!fallbackCustomerNumber && parts.length >= 3) fallbackCustomerNumber = cleanPhone(parts[2]);
      }

      const campaignDid = cleanPhone((call as any).campaign?.phoneNumbers?.[0]?.number);
      const companyDid = cleanPhone((call as any).company?.phoneNumbers?.[0]?.number);

      // Canonical call type classification
      const callType = determineCallType(call);

      // Duration & recording resolution
      const hasRecording = Boolean(call.recordingUrl && String(call.recordingUrl).trim().length > 0);
      let effectiveDurationSec = call.durationSeconds || 0;
      if (hasRecording && effectiveDurationSec === 0) {
        if (call.startedAt && call.endedAt) {
          const diff = Math.round((new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000);
          if (diff > 0 && diff <= 3600) effectiveDurationSec = diff;
        }
        if (effectiveDurationSec === 0) {
          effectiveDurationSec = 26;
        }
      }

      const LIVE_STATUSES = ["RINGING", "ANSWERED", "DISPATCHING", "QUEUED", "QUEUED_AT_PROVIDER", "PENDING"];
      const isLive = LIVE_STATUSES.includes(call.status);
      const finalStatus = normalizeCallStatus(call.status, effectiveDurationSec, hasRecording, isLive);

      // If a call is failed or missed without a recording, talk duration and credits are strictly 0
      if ((finalStatus === "failed" || finalStatus === "missed") && !hasRecording) {
        effectiveDurationSec = 0;
      }

      const effMinutes = Math.floor(effectiveDurationSec / 60);
      const effSeconds = effectiveDurationSec % 60;

      // Telephony credits calculation: ONLY completed calls with duration > 0 incur credits
      let effectiveCredits = 0;
      if (finalStatus === "completed" && effectiveDurationSec > 0) {
        effectiveCredits = call.creditsUsed > 0 ? call.creditsUsed : calculateTelephonyCredits(effectiveDurationSec);
      }

      return {
        id: call.id,
        callId: call.callLogId,
        customerNumber: cleanPhone(call.lead?.phone) || fallbackCustomerNumber || "",
        assignedNumber: cleanPhone(call.phoneNumber?.number) || cleanPhone(call.historicalDidString) || fallbackAssignedNumber || campaignDid || companyDid || "",
        callDateTime: call.startedAt.toISOString(),
        duration: effMinutes > 0 ? `${effMinutes}m ${effSeconds}s` : `${effSeconds}s`,
        durationSeconds: effectiveDurationSec,
        status: finalStatus,
        creditsUsed: effectiveCredits,
        recordingUrl: call.recordingUrl || undefined,
        transcriptUrl: call.transcriptUrl || undefined,
        transcript: [],
        liveStartedAt: isLive ? ((call as any).answeredAt ? (call as any).answeredAt.toISOString() : call.startedAt.toISOString()) : undefined,
        callType,
      };
    }).filter((call) => {
      // Outbound Call Logs table must strictly ONLY show completed lead calls
      if (call.callType === "lead" && (call.status !== "completed" || call.durationSeconds <= 0)) {
        return false;
      }
      return true;
    });

    const adjustedTotal = Math.max(mappedCalls.length, total);

    return NextResponse.json({
      data: mappedCalls,
      meta: {
        total: adjustedTotal,
        page,
        limit,
        totalPages: Math.ceil(adjustedTotal / limit) || 1,
      },
    });
  } catch (err: any) {
    console.error("Failed to fetch outbound calls:", err);
    return NextResponse.json({ data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 1 } });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.split(" ")[1];
    const decoded: any = jwt.verify(token, JWT_SECRET);
    const userId = decoded.sub || decoded.id;

    const member = await (prisma as any).companyMember.findFirst({
      where: { userId, status: "ACTIVE" },
    });

    if (!member?.companyId) {
      return NextResponse.json({ message: "No company found" }, { status: 400 });
    }

    const body = await req.json();

    if (body.action === "fail" && body.phone) {
      const core = getCoreNumber(body.phone);
      if (core) {
        let updateData: any = { status: "FAILED" };
        if (body.assignedNumber) {
          updateData.providerWebhook = { did_number: body.assignedNumber };
        }

        const updated = await prisma.callLog.updateMany({
          where: {
            companyId: member.companyId,
            status: "PENDING",
            lead: {
              phone: { contains: core },
            },
          },
          data: updateData,
        });

        return NextResponse.json({ success: true, count: updated.count });
      }
    }

    return NextResponse.json({ success: false, message: "Invalid request or no pending call found" });
  } catch (err: any) {
    console.error("Failed to update outbound call:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
