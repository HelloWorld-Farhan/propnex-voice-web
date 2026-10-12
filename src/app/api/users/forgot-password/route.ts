import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

const APPS_SCRIPT_URL =
  process.env.APPS_SCRIPT_WEBHOOK_URL ||
  process.env.GOOGLE_APPS_SCRIPT_URL ||
  "https://script.google.com/macros/s/AKfycbz2zj_l7vcmiPZKuYqEVdso0apyW3aDJZZWTVTJ1jRrQr8PLGZIH_TzRpTLFskphIwgDQ/exec";

interface RateBucket {
  timestamps: number[];
}
const forgotIpBuckets = new Map<string, RateBucket>();
const forgotEmailBuckets = new Map<string, RateBucket>();
const MAX_FORGOT_ATTEMPTS_PER_MIN = 5;
const FORGOT_RATE_WINDOW_MS = 60 * 1000;

function checkForgotRateLimit(key: string, map: Map<string, RateBucket>): boolean {
  let bucket = map.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    map.set(key, bucket);
  }
  const cutoff = Date.now() - FORGOT_RATE_WINDOW_MS;
  bucket.timestamps = bucket.timestamps.filter((ts) => ts > cutoff);
  if (bucket.timestamps.length >= MAX_FORGOT_ATTEMPTS_PER_MIN) {
    return true;
  }
  bucket.timestamps.push(Date.now());
  return false;
}

function getIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "127.0.0.1";
}

export async function POST(req: NextRequest) {
  try {
    const { email, domainUrl } = await req.json();

    if (!email) {
      return NextResponse.json({ message: "Email is required" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const clientIp = getIp(req);

    if (checkForgotRateLimit(clientIp, forgotIpBuckets) || checkForgotRateLimit(normalizedEmail, forgotEmailBuckets)) {
      return NextResponse.json(
        { message: "Too many password reset requests. Please wait 1 minute before trying again." },
        { status: 429 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      // Return success even if user not found to prevent email enumeration
      return NextResponse.json({ message: "OTP sent if email exists" }, { status: 200 });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordOtp: otp,
        resetPasswordExpires: expires,
      },
    });

    const host = req.headers.get("host") || "";
    let finalDomainUrl = domainUrl || "https://propnexai.com";
    let branding = undefined;
    if (host) {
      try {
        const domainRecord = await prisma.whiteLabelDomain.findFirst({
          where: { domain: host, status: "ACTIVE" }
        });
        if (domainRecord) {
          finalDomainUrl = "https://" + domainRecord.domain;
          branding = {
            companyName: domainRecord.companyName,
            supportEmail: domainRecord.supportEmail,
            supportPhone: domainRecord.supportPhone,
            domain: domainRecord.domain
          };
        }
      } catch (err) {}
    }

    // Send OTP via Apps Script - NON BLOCKING
    fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "password_reset_otp",
        userEmail: user.email,
        userName: user.firstName || "User",
        otp: otp,
        domainUrl: finalDomainUrl,
        branding: branding
      })
    }).catch(e => console.warn(`Webhook password_reset_otp failed: ${e}`));

    // Log OTP to database for vault inspection
    (prisma as any).otpLog.create({
      data: {
        type: "forgot_password",
        email: user.email,
        otp: otp,
        userName: user.firstName || "User",
        domain: branding?.domain || host || "propnexai.com",
        companyName: branding?.companyName || "PropNex AI",
        status: "SENT",
        expiresAt: expires,
      }
    }).catch((e: any) => console.warn("OtpLog save failed:", e));

    return NextResponse.json({ message: "OTP sent" }, { status: 200 });
  } catch (err: any) {
    console.error("POST /api/users/forgot-password failed:", err);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
