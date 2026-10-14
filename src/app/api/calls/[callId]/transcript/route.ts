import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import prisma from "@/lib/prisma";

const JWT_SECRET = process.env.JWT_SECRET || "propnex_secret_jwt_key_2026_key";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ callId: string }> | { callId: string } }
) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.split(" ")[1];
    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      return NextResponse.json({ message: "Invalid token" }, { status: 401 });
    }

    const resolvedParams = await Promise.resolve(params);
    const { callId } = resolvedParams;

    if (!callId) {
      return NextResponse.json({ message: "Call ID required" }, { status: 400 });
    }

    // Try finding the call log by MongoDB _id, callLogId, publicId, or providerCallId
    const call = await prisma.callLog.findFirst({
      where: {
        OR: [
          { id: callId },
          { callLogId: callId },
          { publicId: callId },
          { providerCallId: callId },
        ],
      },
      include: {
        transcript: true,
      },
    });

    if (!call) {
      return NextResponse.json(
        { transcript: [], message: "Call record not found" },
        { status: 404 }
      );
    }

    const formattedTranscript: { speaker: "agent" | "customer"; text: string; timestamp: string }[] = [];

    // 1. Check if CallTranscript relation has segments
    if (call.transcript) {
      const segs = call.transcript.segments;
      if (Array.isArray(segs) && segs.length > 0) {
        for (const s of segs) {
          if (typeof s === "object" && s !== null) {
            const role = (s as any).role || (s as any).speaker;
            formattedTranscript.push({
              speaker: role === "user" || role === "customer" ? "customer" : "agent",
              text: (s as any).text || (s as any).content || (s as any).message || "",
              timestamp: (s as any).timestamp || (s as any).time || "",
            });
          }
        }
      } else if (call.transcript.fullText) {
        const lines = call.transcript.fullText.split("\n").filter((l) => l.trim().length > 0);
        for (const line of lines) {
          const isUser = line.toLowerCase().startsWith("user:") || line.toLowerCase().startsWith("customer:");
          const text = line.replace(/^(user|customer|agent|ai):\s*/i, "");
          formattedTranscript.push({
            speaker: isUser ? "customer" : "agent",
            text,
            timestamp: "",
          });
        }
      }
    }

    // 2. Check provider webhook payload for conversational turns (Vapi, Bland, Retell, etc.)
    if (formattedTranscript.length === 0 && call.providerWebhook && typeof call.providerWebhook === "object") {
      const wb = call.providerWebhook as any;
      const rawMsgs = wb.messages || wb.transcript || wb.conversation || wb.turns;
      if (Array.isArray(rawMsgs)) {
        for (const m of rawMsgs) {
          if (typeof m === "object" && m !== null) {
            const role = m.role || m.speaker;
            formattedTranscript.push({
              speaker: role === "user" || role === "customer" ? "customer" : "agent",
              text: m.message || m.text || m.content || "",
              timestamp: m.timestamp || m.time || "",
            });
          } else if (typeof m === "string") {
            formattedTranscript.push({
              speaker: "agent",
              text: m,
              timestamp: "",
            });
          }
        }
      } else if (typeof rawMsgs === "string") {
        formattedTranscript.push({
          speaker: "agent",
          text: rawMsgs,
          timestamp: "",
        });
      }
    }

    return NextResponse.json({
      transcript: formattedTranscript,
      transcriptUrl: call.transcriptUrl || undefined,
      recordingUrl: call.recordingUrl || undefined,
      status: call.status,
      durationSeconds: call.durationSeconds,
    });
  } catch (err: any) {
    console.error("GET /api/calls/[callId]/transcript error:", err);
    return NextResponse.json(
      { message: "Internal server error", error: err.message },
      { status: 500 }
    );
  }
}
