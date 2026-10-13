import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// Use the same internal backend URL that next.config.ts uses for its fallback rewrite.
// NEXT_PUBLIC_API_URL is a relative /api path for client-side use.
// On server-side fetch, we target the internal backend directly.
const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN || "http://200.234.34.240:3001";

/**
 * POST /api/calls/reschedule
 * Proxies the reschedule request to the backend NestJS server which
 * queues each failed lead into the BullMQ delayed-calls queue at the
 * specified future date/time.
 *
 * Body: { campaignId, leads, scheduledAt, didNumber }
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { campaignId, leads, scheduledAt, didNumber, uploadedFileName } = body;

    if (!campaignId || !leads || !Array.isArray(leads) || !scheduledAt || !didNumber) {
      return NextResponse.json(
        { error: "Missing required fields: campaignId, leads, scheduledAt, didNumber" },
        { status: 400 }
      );
    }

    // Verify credit balance: reject if 0 credits remaining
    try {
      const jwt = require("jsonwebtoken");
      const token = authHeader.split(" ")[1];
      const decoded: any = jwt.decode(token);
      const userId = decoded?.sub || decoded?.id;
      if (userId) {
        const member = await (prisma as any).companyMember.findFirst({
          where: { userId, status: "ACTIVE" },
          select: { companyId: true }
        });
        if (member?.companyId) {
          const creditBalance = await prisma.creditBalance.findUnique({
            where: { companyId: member.companyId },
            select: { creditsRemaining: true }
          });
          if (!creditBalance || (creditBalance.creditsRemaining ?? 0) <= 0) {
            return NextResponse.json(
              { error: "Cannot schedule calls. Your credit balance is 0. Please top up your account." },
              { status: 403 }
            );
          }
        }
      }
    } catch (e) {
      // Allow downstream to handle if decode error occurs
    }

    // Forward to the backend NestJS controller: POST /api/calls/reschedule
    const backendUrl = `${BACKEND_ORIGIN}/api/calls/reschedule`;

    const backendRes = await fetch(backendUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify({ campaignId, leads, scheduledAt, didNumber, uploadedFileName }),
    });

    if (!backendRes.ok) {
      const errData = await backendRes.json().catch(() => ({ error: "Backend error" }));
      return NextResponse.json(
        { error: errData.error || "Failed to schedule reactivation calls" },
        { status: backendRes.status }
      );
    }

    const data = await backendRes.json();
    return NextResponse.json(data);
  } catch (err: any) {
    console.error("[/api/calls/reschedule] Error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
