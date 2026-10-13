import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { invalidateLogoutCache } from "@/lib/validate-token";

const GLOBAL_LOGOUT_KEY = "global_logout_at";

// POST: Trigger force-logout of all dashboard users
export async function POST(req: NextRequest) {
  try {
    const { adminSecret } = await req.json();

    // Simple secret check — only the admin knows this
    const expectedSecret = process.env.ADMIN_FORCE_LOGOUT_SECRET || process.env.ADMIN_PASSWORD;
    if (!expectedSecret || adminSecret !== expectedSecret) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const nowIso = new Date().toISOString();

    // Upsert the global_logout_at setting — all tokens issued before NOW are invalidated
    await (prisma as any).globalSetting.upsert({
      where: { key: GLOBAL_LOGOUT_KEY },
      update: { value: nowIso },
      create: { key: GLOBAL_LOGOUT_KEY, value: nowIso },
    });

    // Invalidate in-memory cache on this instance
    invalidateLogoutCache();

    return NextResponse.json({
      success: true,
      message: "All users have been force-logged out. They must sign in again via OTP.",
      loggedOutAt: nowIso,
    });
  } catch (err: any) {
    console.error("POST /api/users/force-logout-all failed:", err);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

// GET: Check current global logout timestamp
export async function GET() {
  try {
    const setting = await (prisma as any).globalSetting.findUnique({
      where: { key: GLOBAL_LOGOUT_KEY },
    });
    return NextResponse.json({
      globalLogoutAt: setting?.value || null,
      message: setting
        ? `All tokens issued before ${new Date(setting.value).toLocaleString()} are invalid.`
        : "No global force-logout has been triggered yet.",
    });
  } catch (err: any) {
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
