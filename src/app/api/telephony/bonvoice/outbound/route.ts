import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getBonvoiceToken } from "@/lib/bonvoice";

export async function POST(req: Request) {
  try {
    const { leadId, phoneNumberId, agentId } = await req.json();

    if (!leadId || !phoneNumberId || !agentId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    const phoneNumber = await (prisma.phoneNumber.findUnique as any)({
      where: { id: phoneNumberId },
      select: {
        id: true,
        number: true,
        channels: true,
        agentUrl: true,   // The voicebot WSS URL configured per-number in admin panel
        direction: true,
        status: true,
        companyId: true,
      }
    });

    if (!lead || !lead.phone) {
      return NextResponse.json({ error: "Lead or lead phone not found" }, { status: 404 });
    }

    if (!phoneNumber) {
      return NextResponse.json({ error: "Phone number not found" }, { status: 404 });
    }

    if (lead.companyId) {
      const creditBalance = await prisma.creditBalance.findUnique({
        where: { companyId: lead.companyId },
        select: { creditsRemaining: true }
      });
      if (!creditBalance || (creditBalance.creditsRemaining ?? 0) <= 0) {
        return NextResponse.json(
          { error: "Insufficient credits. Your balance is 0. Please top up to make calls." },
          { status: 403 }
        );
      }
    }

    // Authenticate with Bonvoice
    const token = await getBonvoiceToken();

    const baseUrl = process.env.BONVOICE_BASE_URL || "https://backend.pbx.bonvoice.com";

    // Use the agentUrl configured per-number in the admin panel (Numbers → Outbound → Agent URL).
    // Fall back to the global env var only if the DB field is empty.
    // If neither is set, reject the call with a clear error.
    const template_url =
      (phoneNumber as any).agentUrl?.trim() ||
      process.env.BONVOICE_VOICEBOT_URL?.trim();

    if (!template_url) {
      return NextResponse.json(
        { error: "No Agent URL configured for this outbound number. Please set it in the admin panel under Numbers → Outbound." },
        { status: 400 }
      );
    }

    // Create a pending call log record in our DB
    const callLogPublicId = `CL${Date.now()}-${phoneNumber.id.substring(0, 5)}`;
    const callLog = await prisma.callLog.create({
      data: {
        callLogId:     callLogPublicId,
        publicId:      callLogPublicId,
        providerCallId: `pending-${callLogPublicId}`, // placeholder so webhook can find it
        direction:     "OUTBOUND",
        status:        "PENDING",
        startedAt:     new Date(),
        companyId:     lead.companyId,
        leadId:        lead.id,
        phoneNumberId: phoneNumber.id,
        aiAgentId:     agentId,
        historicalDidString: phoneNumber.number,
        historicalChannels:  phoneNumber.channels || 1,
        durationSeconds: 0,
        provider: "BONVOICE",
      } as any,
    });

    const bonvoiceRes = await fetch(`${baseUrl}/click2call/`, { // Adjust to match exact Bonvoice endpoint for voicebots
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Token ${token}`
      },
      body: JSON.stringify({
        source_number: phoneNumber.number, // The DID we are calling from
        destination_number: lead.phone, // The customer we are calling
        template_url: template_url, // Webhook to process the Voicebot stream
        reference_id: callLog.id // Optional to link back webhook to this DB record
      }),
    });

    if (!bonvoiceRes.ok) {
      const errBody = await bonvoiceRes.text();
      console.error("Bonvoice outbound call failed:", errBody);
      
      await prisma.callLog.update({
        where: { id: callLog.id },
        data: { status: "FAILED" }
      });

      return NextResponse.json({ error: "Bonvoice API error", details: errBody }, { status: bonvoiceRes.status });
    }

    // Call successfully dispatched to Bonvoice
    await prisma.callLog.update({
      where: { id: callLog.id },
      data: { status: "DISPATCHING" }
    });

    return NextResponse.json({ success: true, message: "Outbound call initiated", callLog });
  } catch (error: any) {
    console.error("Error creating outbound call:", error);
    return NextResponse.json({ error: "Internal Server Error", message: error.message }, { status: 500 });
  }
}
