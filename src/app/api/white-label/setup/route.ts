import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { domain, companyName, tabTitle, supportEmail, userEmail, supportPhone, logoUrl, faviconUrl, instagramUrl, linkedinUrl } = body;

    if (!domain || !companyName || !supportEmail || !logoUrl || !faviconUrl) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Check if domain already exists
    const existing = await prisma.whiteLabelDomain.findUnique({
      where: { domain }
    });

    if (existing) {
      return NextResponse.json({ error: "This domain is already registered or pending." }, { status: 400 });
    }

    // Check if there is a placeholder invite for this email
    const placeholder = await prisma.whiteLabelDomain.findFirst({
      where: {
        supportEmail: userEmail || supportEmail, // Find by userEmail, fallback to supportEmail for safety
        status: "PENDING",
        domain: { startsWith: "pending-" }
      }
    });

    let newDomain;
    const pagesConfigPayload = JSON.stringify({
      features: true,
      product: true,
      pricing: true,
      docs: true,
      dashboard: true,
      submittedViaForm: true,
      userName: body.name || "User"
    });

    if (placeholder) {
      newDomain = await prisma.whiteLabelDomain.update({
        where: { id: placeholder.id },
        data: {
          domain,
          companyName,
          tabTitle: tabTitle || companyName,
          supportEmail,
          supportPhone: supportPhone || "",
          logoUrl,
          faviconUrl,
          instagramUrl: instagramUrl || "",
          linkedinUrl: linkedinUrl || "",
          pagesConfig: pagesConfigPayload
        }
      });
    } else {
      newDomain = await prisma.whiteLabelDomain.create({
        data: {
          domain,
          companyName,
          tabTitle: tabTitle || companyName,
          supportEmail,
          supportPhone: supportPhone || "",
          logoUrl,
          faviconUrl,
          instagramUrl: instagramUrl || "",
          linkedinUrl: linkedinUrl || "",
          status: "PENDING",
          pagesConfig: pagesConfigPayload
        }
      });
    }

    try {
      await prisma.systemEvent.create({
        data: {
          type: "FORM_INFO",
          title: "New White Label Submission",
          message: `${companyName} (${domain}) submitted their branding details.`,
        }
      });
    } catch (e) {
      console.error("Failed to log system event", e);
    }

    const webhookUrl =
      process.env.GAS_WEBHOOK_URL ||
      process.env.APPS_SCRIPT_WEBHOOK_URL ||
      process.env.GOOGLE_APPS_SCRIPT_URL ||
      "https://script.google.com/macros/s/AKfycbz2zj_l7vcmiPZKuYqEVdso0apyW3aDJZZWTVTJ1jRrQr8PLGZIH_TzRpTLFskphIwgDQ/exec";
    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "white_label_received",
            email: userEmail || supportEmail, // Send confirmation to the actual user
            userName: body.name || "User",
            domain: domain,
            companyName: companyName,
            supportPhone: supportPhone || "N/A",
            instagramUrl: instagramUrl || "N/A",
            linkedinUrl: linkedinUrl || "N/A",
            tabTitle: tabTitle || companyName
          })
        });
      } catch (err) {
        console.error("Failed to trigger GAS webhook for received:", err);
      }
    }

    return NextResponse.json({ success: true, domain: newDomain });
  } catch (error: any) {
    console.error("White label setup error:", error);
    return NextResponse.json({ error: "Failed to submit white label setup" }, { status: 500 });
  }
}
