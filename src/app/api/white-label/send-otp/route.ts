import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { email, name } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required. Access this page via your email link." }, { status: 400 });
    }

    // Generate a 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Send it to GAS Webhook
    const webhookUrl =
      process.env.GAS_WEBHOOK_URL ||
      process.env.APPS_SCRIPT_WEBHOOK_URL ||
      process.env.GOOGLE_APPS_SCRIPT_URL ||
      "https://script.google.com/macros/s/AKfycbz2zj_l7vcmiPZKuYqEVdso0apyW3aDJZZWTVTJ1jRrQr8PLGZIH_TzRpTLFskphIwgDQ/exec";

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "white_label_otp",
          email: email,
          userName: name || "User",
          otp: otp
        })
      });

      if (!response.ok) {
        throw new Error(`GAS returned status ${response.status}`);
      }
    } catch (err) {
      console.error("Failed to send OTP via GAS webhook:", err);
      return NextResponse.json({ error: "Failed to communicate with the email server." }, { status: 500 });
    }

    // Log OTP to database for vault inspection
    const expires = new Date(Date.now() + 10 * 60 * 1000);
    (prisma as any).otpLog.create({
      data: {
        type: "white_label_otp",
        email: email,
        otp: otp,
        userName: name || "User",
        domain: "propnexai.com",
        companyName: "PropNex AI White Label",
        status: "SENT",
        expiresAt: expires,
      }
    }).catch((e: any) => console.warn("OtpLog save failed:", e));

    // Return the expected OTP to the frontend so it can verify the user input
    return NextResponse.json({ success: true, otp });

  } catch (error: any) {
    console.error("Send OTP error:", error);
    return NextResponse.json({ error: "Failed to send OTP" }, { status: 500 });
  }
}
