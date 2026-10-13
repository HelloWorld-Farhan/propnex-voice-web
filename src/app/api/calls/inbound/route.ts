import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import prisma from "@/lib/prisma";

const JWT_SECRET = process.env.JWT_SECRET || "propnex_secret_jwt_key_2026_key";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function getCoreNumber(num: string) {
  if (!num) return "";
  let d = num.replace(/\D/g, "").replace(/^0+/, "");
  if (d.startsWith("91") && d.length >= 10) {
    d = d.substring(2);
  }
  return d;
}

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
      return NextResponse.json({
        data: [],
        meta: { total: 0, page: 1, limit: 10, totalPages: 1 },
      });
    }

    const { searchParams } = new URL(req.url);
    const targetCompanyId = searchParams.get("companyId");

    let companyIdsToQuery: string[] = [];

    if (targetCompanyId && targetCompanyId !== member.companyId) {
      // Viewing a specific sub-company — verify it belongs to this parent
      const subCompany = await (prisma.company.findFirst as any)({
        where: { id: targetCompanyId, parentCompanyId: member.companyId },
      });
      companyIdsToQuery = subCompany ? [targetCompanyId] : [member.companyId];
    } else {
      // Viewing all: parent + every child
      const subCompanies = await prisma.company.findMany({
        where: { parentCompanyId: member.companyId },
        select: { id: true },
      });
      companyIdsToQuery = [
        member.companyId,
        ...subCompanies.map((c: any) => c.id),
      ];
    }

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
    const sortBy = searchParams.get("sortBy") || "date";
    const sortOrder = (searchParams.get("sortOrder") || "desc").toLowerCase() === "asc" ? "asc" : "desc";
    const directionParam = searchParams.get("direction");
    const directionVal = directionParam?.toUpperCase() === "OUTBOUND" ? "OUTBOUND" : "INBOUND";

    const whereClause: any = {
      companyId: { in: companyIdsToQuery },
      direction: directionVal,
      // Exclude inbound calls that came in on a number configured as OUTBOUND-only
      // (calls with no linked phoneNumber are still shown)
      ...(directionVal === "INBOUND" ? {
        NOT: {
          phoneNumber: { direction: "OUTBOUND" }
        }
      } : {}),
    };

    // Status filter
    const statusParam = searchParams.get("status");
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

    console.log("INBOUND_API: searchParams received:", {
      assignedNumber,
      callerNumber,
      search,
      minDuration,
      durationUnit,
      sortBy,
      sortOrder,
      status: statusParam,
      direction: directionVal
    });

    const andConditions: any[] = [];

    if (assignedNumber) {
      const core = getCoreNumber(assignedNumber);
      if (core) {
        andConditions.push({
          OR: [
            { phoneNumber: { number: { contains: core } } },
            { historicalDidString: { contains: core } },
            { providerCallId: { contains: core } },
          ]
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
          ]
        });
      }
    }

    if (dateFrom || dateTo) {
      whereClause.startedAt = {};
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
        ]
      });
    }

    if (andConditions.length > 0) {
      whereClause.AND = andConditions;
    }

    console.log("INBOUND_API: whereClause is:", JSON.stringify(whereClause, null, 2));

    // Only include ringing/answered live calls when viewing "all", "ringing", or "answered"
    const shouldIncludeLive = !statusParam || statusParam === "all" || statusParam.toLowerCase() === "ringing" || statusParam.toLowerCase() === "answered";
    const liveWhereClause: any = {
      companyId: { in: companyIdsToQuery },
      direction: directionVal,
      status: { in: ["RINGING", "ANSWERED", "QUEUED"] },
      ...(directionVal === "INBOUND" ? {
        NOT: { phoneNumber: { direction: "OUTBOUND" } }
      } : {}),
    };

    const prismaOrderBy: any = sortBy === "duration"
      ? { durationSeconds: sortOrder }
      : { startedAt: sortOrder };

    const [total, calls, liveCalls] = await Promise.all([
      prisma.callLog.count({ where: whereClause }),
      prisma.callLog.findMany({
        where: whereClause,
        orderBy: prismaOrderBy,
        skip,
        take: limit,
        include: { phoneNumber: true, lead: true },
      }),
      shouldIncludeLive
        ? prisma.callLog.findMany({
            where: liveWhereClause,
            orderBy: { startedAt: "desc" },
            take: 10,
            include: { phoneNumber: true, lead: true },
          })
        : Promise.resolve([]),
    ]);

    // Helper to extract a unique call key across parent and subcompany records
    function getCallDedupeKey(c: any): string {
      if (c.providerCallId && String(c.providerCallId).trim()) {
        return `prov_${String(c.providerCallId).trim()}`;
      }
      const caller = getCoreNumber(c.lead?.phone || c.providerWebhook?.SourceNumber || c.providerWebhook?.caller || "");
      const did = getCoreNumber(c.phoneNumber?.number || c.providerWebhook?.DisplayNumber || c.providerWebhook?.did || "");
      const timeBucket = c.startedAt ? Math.floor(new Date(c.startedAt).getTime() / 15000) : 0;
      if (caller && did && timeBucket > 0) {
        return `call_${caller}_${did}_${timeBucket}`;
      }
      return `id_${c.id}`;
    }

    function formatDisplayNumber(num: string): string {
      if (!num) return "";
      const cleaned = num.trim();
      if (cleaned.startsWith("+")) return cleaned;
      const digits = cleaned.replace(/\D/g, "");
      if (digits.length === 10) return `+91${digits}`;
      if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.substring(1)}`;
      if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
      return cleaned;
    }

    // Merge live calls at the top, deduplicate by call key so a call never appears twice
    const seenCallKeys = new Set<string>();
    const mergedCalls: any[] = [];
    for (const c of [...liveCalls, ...calls]) {
      const key = getCallDedupeKey(c);
      if (!seenCallKeys.has(key)) {
        seenCallKeys.add(key);
        mergedCalls.push(c);
      }
    }

    const mappedCalls = mergedCalls.map((call: any) => {
      const minutes = Math.floor((call.durationSeconds || 0) / 60);
      const seconds = (call.durationSeconds || 0) % 60;
      
      let fallbackAssignedNumber = "";
      let fallbackCustomerNumber = "";
      if (call.providerWebhook && typeof call.providerWebhook === 'object') {
         const wh: any = call.providerWebhook;
         // Bonvoice: DisplayNumber = DID (assigned number), SourceNumber = caller
         fallbackAssignedNumber =
           wh.DisplayNumber || wh.display_number || wh.displayNumber ||
           wh.DestinationNumber || wh.destination_number || wh.destinationNumber || wh.did ||
           wh.agentNumber || wh.did_number || wh.didNumber ||
           wh.message?.call?.agent?.number || wh.call?.agent?.number || "";
         
         fallbackCustomerNumber =
           wh.SourceNumber || wh.source_number || wh.sourceNumber ||
           wh.caller || wh.from_number || wh.from ||
           wh.customer_number || wh.customerNumber || "";
         
         // Last resort: parse DID from callID (format: uuid-DID-CALLER-DATE-TIME)
         const callIdRaw = wh.callID || wh.callId || wh.call_id || wh.uuid;
         if (!fallbackAssignedNumber && callIdRaw && typeof callIdRaw === 'string') {
           const parts = callIdRaw.split('-');
           if (parts.length >= 3) fallbackAssignedNumber = parts[1];
         }
         if (!fallbackCustomerNumber && callIdRaw && typeof callIdRaw === 'string') {
           const parts = callIdRaw.split('-');
           if (parts.length >= 3) fallbackCustomerNumber = parts[2];
         }
      }

      const custRaw = call.lead?.phone || fallbackCustomerNumber || "";
      const assignRaw = call.phoneNumber?.number || fallbackAssignedNumber || "";

      const rawInboundStatus = call.status.toLowerCase();
      const inboundDisplayStatus =
        rawInboundStatus === "busy" || rawInboundStatus === "no_answer" || rawInboundStatus === "noanswer"
          ? "missed"
          : rawInboundStatus;

      return {
        id: call.id,
        callId: call.callLogId,
        customerNumber: formatDisplayNumber(custRaw),
        assignedNumber: formatDisplayNumber(assignRaw),
        callDateTime: call.startedAt.toISOString(),
        duration: minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`,
        durationSeconds: call.durationSeconds || 0,
        status: inboundDisplayStatus,
        creditsUsed: call.creditsUsed || 0,
        recordingUrl: call.recordingUrl || undefined,
        transcriptUrl: call.transcriptUrl || undefined,
        transcript: [],
        liveStartedAt: (call.status === "RINGING" || call.status === "ANSWERED") ? ((call as any).answeredAt ? (call as any).answeredAt.toISOString() : call.startedAt.toISOString()) : undefined,
      };
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
    console.error("Failed to fetch inbound calls:", err);
    return NextResponse.json({
      data: [],
      meta: { total: 0, page: 1, limit: 10, totalPages: 1 },
    });
  }
}
