import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

function cleanPhone(raw: any): string {
  if (!raw) return "";
  return String(raw).replace(/\D/g, "").slice(-10);
}

export async function POST(req: NextRequest) {
  try {
    const internalSecret = req.headers.get("x-internal-secret");
    const forwardedFor = req.headers.get("x-forwarded-for") || "";
    const clientIp = req.headers.get("x-real-ip") || (req as any).ip || "";
    const isLocalhost =
      forwardedFor.includes("127.0.0.1") ||
      forwardedFor.includes("::1") ||
      clientIp === "127.0.0.1" ||
      clientIp === "::1";

    if (internalSecret !== "propnex_internal_secret_2026" && !isLocalhost) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { customerNumber, callerFrom, callerTo, callId, answeredAt } = body;

    const corePhone = cleanPhone(customerNumber) || cleanPhone(callerTo) || cleanPhone(callerFrom);
    if (!corePhone && !callId) {
      return NextResponse.json({ error: "Missing customerNumber or callId" }, { status: 400 });
    }

    const answerTime = answeredAt ? new Date(answeredAt) : new Date();

    // Find the active ringing / pending outbound call log
    const activeLog = await (prisma as any).callLog.findFirst({
      where: {
        direction: "OUTBOUND",
        status: { in: ["RINGING", "PENDING", "DISPATCHING", "QUEUED", "QUEUED_AT_PROVIDER"] },
        OR: [
          ...(corePhone ? [{ lead: { phone: { contains: corePhone } } }] : []),
          ...(callId ? [{ providerCallId: { contains: String(callId) } }] : []),
          ...(callId ? [{ publicId: { contains: String(callId) } }] : []),
          ...(callId ? [{ callLogId: { contains: String(callId) } }] : [])
        ]
      },
      orderBy: { createdAt: "desc" }
    });

    if (!activeLog) {
      console.log(`[Internal Answered] No matching active ringing call found for phone=${corePhone} callId=${callId}`);
      return NextResponse.json({ success: false, message: "No active ringing call found" });
    }

    const updated = await (prisma as any).callLog.update({
      where: { id: activeLog.id },
      data: {
        status: "ANSWERED",
        answeredAt: answerTime,
        updatedAt: new Date(),
        ...(callId && activeLog.providerCallId?.startsWith("pending-") ? { providerCallId: String(callId) } : {})
      }
    });

    console.log(`[Internal Answered] Successfully marked call ${updated.id} as ANSWERED at ${answerTime.toISOString()}`);
    return NextResponse.json({
      success: true,
      callId: updated.id,
      answeredAt: answerTime.toISOString()
    });
  } catch (error: any) {
    console.error("[Internal Answered] Error:", error);
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 });
  }
}
