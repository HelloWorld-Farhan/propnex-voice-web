import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { calculateTelephonyCredits } from "@/lib/telephony-utils";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { callId, durationSeconds } = await req.json();

    if (!callId || typeof durationSeconds !== "number" || durationSeconds <= 0) {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }

    const creditsUsed = calculateTelephonyCredits(durationSeconds);

    const updated = await prisma.callLog.update({
      where: { id: callId },
      data: {
        durationSeconds,
        creditsUsed,
        status: "COMPLETED",
        providerStatus: "COMPLETED",
      },
    });

    return NextResponse.json({ success: true, id: updated.id, durationSeconds, creditsUsed });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to sync duration" }, { status: 500 });
  }
}
