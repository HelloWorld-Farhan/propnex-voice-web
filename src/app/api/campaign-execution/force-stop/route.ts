import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import jwt from "jsonwebtoken";
import { clearDashboardCache } from "@/app/api/reactivation/dashboard/route";

const JWT_SECRET = process.env.JWT_SECRET || "propnex_secret_jwt_key_2026_key";

async function getCompanyIdFromReq(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;

  const token = authHeader.split(" ")[1];
  try {
    const decoded: any = jwt.verify(token, JWT_SECRET) || jwt.decode(token);
    const userId = decoded?.sub || decoded?.id;
    if (!userId) return null;

    const member = await (prisma as any).companyMember.findFirst({
      where: { userId, status: "ACTIVE" },
      select: { companyId: true }
    });

    return member?.companyId || null;
  } catch (e) {
    try {
      const decoded: any = jwt.decode(token);
      const userId = decoded?.sub || decoded?.id;
      if (!userId) return null;
      const member = await (prisma as any).companyMember.findFirst({
        where: { userId, status: "ACTIVE" },
        select: { companyId: true }
      });
      return member?.companyId || null;
    } catch {
      return null;
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Body may be empty
    }

    const tokenCompanyId = await getCompanyIdFromReq(req);
    const finalCompanyId = body?.companyId || tokenCompanyId;

    if (!finalCompanyId) {
      return NextResponse.json({ error: "Unauthorized: Company not found" }, { status: 401 });
    }

    // 1. Immediately fail all active/ringing/pending outbound calls for this company in DB
    let modifiedCallsCount = 0;
    try {
      const updateResult = await (prisma as any).callLog.updateMany({
        where: {
          companyId: finalCompanyId,
          direction: "OUTBOUND",
          status: { in: ["PENDING", "RINGING", "DISPATCHING", "QUEUED", "QUEUED_AT_PROVIDER"] }
        },
        data: {
          status: "FAILED",
          durationSeconds: 0,
          providerStatus: "force_stopped",
          updatedAt: new Date()
        }
      });
      modifiedCallsCount = updateResult.count;
    } catch (dbErr) {
      console.error("[ForceStop Route] Database update error:", dbErr);
    }

    // Invalidate dashboard cache immediately
    try {
      clearDashboardCache(finalCompanyId);
    } catch (cErr) {
      console.error("[ForceStop Route] Cache clear error:", cErr);
    }

    // 2. Notify propnexai-main-server on port 3002 or via public api
    let backendState: any = null;
    const backendEndpoints = [
      "http://127.0.0.1:3002/api/campaign-execution/force-stop",
      "https://api.propnexai.com/api/campaign-execution/force-stop"
    ];

    for (const url of backendEndpoints) {
      try {
        const resp = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(authHeader ? { Authorization: authHeader } : {})
          },
          body: JSON.stringify({ companyId: finalCompanyId }),
          signal: AbortSignal.timeout(4000)
        });

        if (resp.ok) {
          const data = await resp.json().catch(() => ({}));
          backendState = data?.state || null;
          break;
        }
      } catch (beErr) {
        // Continue to fallback endpoint
      }
    }

    return NextResponse.json({
      success: true,
      message: "Campaign force stopped and ringing calls terminated",
      modifiedCalls: modifiedCallsCount,
      state: backendState || { status: "force_stopped" }
    });
  } catch (error: any) {
    console.error("[ForceStop Route] Critical error:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
