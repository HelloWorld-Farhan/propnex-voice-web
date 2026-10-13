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
      where: { userId, status: "ACTIVE" }
    });

    if (!member?.companyId) {
      return NextResponse.json({ data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 1 } });
    }

    const { searchParams } = new URL(req.url);
    const targetCompanyId = searchParams.get("companyId");
    
    let companyIdsToQuery = [member.companyId];

    let freshStartAfter: Date | null = null;

    if (targetCompanyId && targetCompanyId !== member.companyId) {
      // Check if targetCompanyId is a sub-company of the user's company
      const subCompany = await (prisma.company.findFirst as any)({
        where: { id: targetCompanyId, parentCompanyId: member.companyId },
        include: { phoneNumbers: { select: { createdAt: true }, take: 1, orderBy: { createdAt: "asc" } } }
      });
      if (subCompany) {
        companyIdsToQuery = [targetCompanyId];
        // Fresh-start: only show calls from when the first number was assigned
        const earliestAssignment = (subCompany as any).phoneNumbers?.[0]?.createdAt;
        if (earliestAssignment) freshStartAfter = new Date(earliestAssignment);
      }
    } else {
      // Fetch parent + all child companies' calls
      const subCompanies = await prisma.company.findMany({
        where: { parentCompanyId: member.companyId },
        select: { id: true }
      });
      companyIdsToQuery = [member.companyId, ...subCompanies.map((c: any) => c.id)];
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
    const statusParam = searchParams.get("status");
    const sortBy = searchParams.get("sortBy") || "duration";
    const sortOrder = (searchParams.get("sortOrder") || "asc").toLowerCase() === "desc" ? "desc" : "asc";

    const getWhereClause = () => {
      const whereClause: any = {
        companyId: { in: companyIdsToQuery },
        direction: "OUTBOUND",
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

      if (assignedNumber) {
        const core = getCoreNumber(assignedNumber);
        if (core) {
          whereClause.phoneNumber = { number: { contains: core } };
        }
      }

      if (callerNumber) {
        const core = getCoreNumber(callerNumber);
        if (core) {
          whereClause.lead = { phone: { contains: core } };
        }
      }

      if (dateFrom || dateTo || freshStartAfter) {
        whereClause.startedAt = {};
        // Fresh-start: only show calls from when the phone number was assigned
        if (freshStartAfter) whereClause.startedAt.gte = freshStartAfter;
        if (dateFrom) whereClause.startedAt.gte = new Date(dateFrom);
        if (dateTo) {
          const toDate = new Date(dateTo);
          toDate.setHours(23, 59, 59, 999);
          whereClause.startedAt.lte = toDate;
        }
      }

      if (minDuration) {
        let minSec = parseFloat(minDuration);
        if (!isNaN(minSec)) {
          if (durationUnit === "min") {
            minSec = minSec * 60;
          }
          whereClause.durationSeconds = { gte: minSec };
        }
      }

      if (search) {
        const core = getCoreNumber(search);
        if (core) {
          whereClause.OR = [
            { lead: { phone: { contains: core } } },
            { phoneNumber: { number: { contains: core } } },
          ];
        } else {
          whereClause.OR = [
            { lead: { phone: { contains: search } } },
            { phoneNumber: { number: { contains: search } } },
          ];
        }
      }

      // Hide failed/missed/0s calls IF they are Lead Reactivation calls, unless user specifically filtered for failed/missed
      if (!statusParam || statusParam.toLowerCase() === "all" || statusParam.toUpperCase() === "COMPLETED") {
        whereClause.NOT = {
          AND: [
            { correlationId: { isSet: true } },
            { correlationId: { startsWith: "reactivation-" } },
            {
              OR: [
                { status: { not: "COMPLETED" } },
                { durationSeconds: 0 }
              ]
            }
          ]
        };
      }

      return whereClause;
    };

    const whereClause = getWhereClause();
    const prismaOrderBy: any = sortBy === "duration"
      ? { durationSeconds: sortOrder }
      : { startedAt: sortOrder };
    
    const [total, calls] = await Promise.all([
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
          company: { include: { phoneNumbers: { where: { direction: { in: ["OUTBOUND", "BOTH"] } }, take: 1 } } }
        }
      })
    ]);
    
    const mappedCalls = calls.map(call => {
      const minutes = Math.floor((call.durationSeconds || 0) / 60);
      const seconds = (call.durationSeconds || 0) % 60;
      
      // Aggressively extract assigned/DID number from all available JSON fields
      let fallbackAssignedNumber = "";
      let fallbackCustomerNumber = "";
      
      // 1. Try providerWebhook (Bonvoice: DisplayNumber = DID assigned number)
      if (call.providerWebhook && typeof call.providerWebhook === 'object') {
         const wh: any = call.providerWebhook;
         // Bonvoice OUTBOUND: DisplayNumber or SourceNumber = DID (assigned number), DestinationNumber = customer
         fallbackAssignedNumber =
           wh.DisplayNumber || wh.display_number || wh.displayNumber ||
           wh.SourceNumber || wh.source_number || wh.sourceNumber || wh.did ||
           wh.agentNumber || wh.did_number || wh.didNumber ||
           wh.message?.call?.agent?.number || wh.call?.agent?.number || "";
         
         fallbackCustomerNumber =
           wh.DestinationNumber || wh.destination_number || wh.destinationNumber ||
           wh.caller || wh.to_number || wh.to ||
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

      // 2. Try providerRequest (sent payload usually has the DID)
      if (!fallbackAssignedNumber && call.providerRequest && typeof call.providerRequest === 'object') {
        const req: any = call.providerRequest;
        fallbackAssignedNumber =
          req.did_number || req.didNumber || req.agentNumber || req.from_number ||
          req.agent?.number || req.call?.did_number || "";
      }

      // 3. Try providerResponse
      if (!fallbackAssignedNumber && call.providerResponse && typeof call.providerResponse === 'object') {
        const res: any = call.providerResponse;
        fallbackAssignedNumber =
          res.did_number || res.didNumber || res.agentNumber || res.from || "";
      }

      // 4. Try campaign's linked phone number
      const campaignDid = (call as any).campaign?.phoneNumbers?.[0]?.number || "";

      // 5. Try the company's default outbound phone number
      const companyDid = (call as any).company?.phoneNumbers?.[0]?.number || "";

      // The fallbackCustomerNumber was already extracted above (lines 175-189)

      // 6. Determine callType
      let callType: "lead" | "campaign" | "internal" = "internal";
      if (call.campaignId || (call.correlationId && call.correlationId.startsWith("camp-"))) {
        callType = "campaign";
      } else if (call.correlationId && call.correlationId.startsWith("reactivation-")) {
        callType = "lead";
      } else {
        callType = "internal";
      }

      return {
        id: call.id,
        callId: call.callLogId,
        customerNumber: call.lead?.phone || fallbackCustomerNumber || "",
        assignedNumber: call.phoneNumber?.number || fallbackAssignedNumber || campaignDid || companyDid || "",
        callDateTime: call.startedAt.toISOString(),
        duration: minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`,
        durationSeconds: call.durationSeconds || 0,
        status: call.status.toLowerCase(),
        creditsUsed: call.creditsUsed || 0,
        recordingUrl: call.recordingUrl || undefined,
        transcriptUrl: call.transcriptUrl || undefined,
        transcript: [],
        liveStartedAt: (call.status === "RINGING" || call.status === "ANSWERED") ? ((call as any).answeredAt ? (call as any).answeredAt.toISOString() : call.startedAt.toISOString()) : undefined,
        callType,
      };
    });

    return NextResponse.json({
      data: mappedCalls,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1
      }
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
      where: { userId, status: "ACTIVE" }
    });

    if (!member?.companyId) {
      return NextResponse.json({ message: "No company found" }, { status: 400 });
    }

    const body = await req.json();
    
    if (body.action === "fail" && body.phone) {
      const core = getCoreNumber(body.phone);
      if (core) {
        // Mark ALL PENDING calls for this phone as FAILED to prevent stuck states
        let updateData: any = { status: "FAILED" };
        if (body.assignedNumber) {
           updateData.providerWebhook = { did_number: body.assignedNumber };
        }
        
        const updated = await prisma.callLog.updateMany({
          where: {
            companyId: member.companyId,
            status: "PENDING",
            lead: {
              phone: { contains: core }
            }
          },
          data: updateData
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
