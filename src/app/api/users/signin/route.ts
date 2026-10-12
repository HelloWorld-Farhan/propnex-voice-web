import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "@/lib/prisma";

const JWT_SECRET = process.env.JWT_SECRET || "propnex_secret_jwt_key_2026_key";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body as { email: string; password: string };

    if (!email?.trim() || !password) {
      return NextResponse.json({ message: "Email and password are required" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({ 
      where: { email: normalizedEmail },
      include: {
        memberships: {
          where: { status: "ACTIVE" },
          include: { company: { select: { id: true, contractId: true, status: true, creditBalance: true } } }
        }
      }
    });

    if (!user) {
      return NextResponse.json({ message: "Invalid email or password" }, { status: 401 });
    }

    const userAny = user as any;

    if (!userAny.passwordHash) {
      return NextResponse.json(
        { message: "This account uses a different sign-in method. Please contact support." },
        { status: 401 }
      );
    }

    const isValid = await bcrypt.compare(password, userAny.passwordHash);
    if (!isValid) {
      return NextResponse.json({ message: "Invalid email or password" }, { status: 401 });
    }

    if (userAny.status === "SUSPENDED" || userAny.status === "DEACTIVATED") {
      return NextResponse.json({ message: "Your account has been suspended. Please contact support." }, { status: 403 });
    }

    const { trusted, trustedAt, domainUrl } = body as { trusted?: boolean; trustedAt?: string; domainUrl?: string };

    // If a global force-logout was triggered, check if the device trust was granted AFTER the logout
    // Only require OTP if the trust predates the force-logout (or no trustedAt timestamp was sent)
    let effectiveTrusted = trusted;
    try {
      const globalLogoutSetting = await (prisma as any).globalSetting.findUnique({
        where: { key: "global_logout_at" }
      });
      if (globalLogoutSetting?.value) {
        const globalLogoutAt = new Date(globalLogoutSetting.value);
        if (!trustedAt || new Date(trustedAt) <= globalLogoutAt) {
          // Device trust predates the force-logout → require OTP again
          effectiveTrusted = false;
        }
        // else: trustedAt > globalLogoutAt → user already re-authenticated via OTP after the logout → allow bypass
      }
    } catch (e) {
      // If setting doesn't exist yet, proceed normally
    }

    if (!effectiveTrusted) {
      // Generate OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expires = new Date(Date.now() + 10 * 60 * 1000);

      await prisma.user.update({
        where: { id: user.id },
        data: { resetPasswordOtp: otp, resetPasswordExpires: expires }
      });

      const host = req.headers.get("host") || "";
      let domainUrl = "https://propnexai.com";
      let branding = undefined;

      if (host) {
        try {
          const domainRecord = await prisma.whiteLabelDomain.findFirst({
            where: { domain: host, status: "ACTIVE" }
          });
          if (domainRecord) {
            domainUrl = "https://" + domainRecord.domain;
            branding = {
              companyName: domainRecord.companyName,
              supportEmail: domainRecord.supportEmail,
              supportPhone: domainRecord.supportPhone,
              domain: domainRecord.domain
            };
          }
        } catch (err) {}
      }


      const APPS_SCRIPT_URL =
        process.env.APPS_SCRIPT_WEBHOOK_URL ||
        process.env.GOOGLE_APPS_SCRIPT_URL ||
        "https://script.google.com/macros/s/AKfycbz2zj_l7vcmiPZKuYqEVdso0apyW3aDJZZWTVTJ1jRrQr8PLGZIH_TzRpTLFskphIwgDQ/exec";
      // Trigger Google Apps Script Webhook - NON BLOCKING
      fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "login_otp",
          userEmail: user.email,
          userName: user.firstName || "User",
          otp: otp,
          domainUrl: domainUrl || "https://propnexai.com",
          branding: branding
        })
      }).catch(err => console.error("Failed to send login OTP:", err));

      // Log OTP to database for vault inspection
      (prisma as any).otpLog.create({
        data: {
          type: "login_otp",
          email: user.email,
          otp: otp,
          userName: user.firstName || "User",
          domain: branding?.domain || host || "propnexai.com",
          companyName: branding?.companyName || "PropNex AI",
          status: "SENT",
          expiresAt: expires,
        }
      }).catch((e: any) => console.warn("OtpLog save failed:", e));

      return NextResponse.json({ message: "OTP required", requireOtp: true }, { status: 200 });
    }

    let companyId: string | null = null;
    let contractId: string | null = null;
    let companyStatus: string | null = null;
    let creditBalance: any = undefined;
    let assignedNumber: string | null = null;

    if (userAny.memberships && userAny.memberships.length > 0) {
      const member = userAny.memberships[0];
      if (member?.company) {
        companyId = member.company.id;
        contractId = member.company.contractId;
        companyStatus = member.company.status;
        creditBalance = member.company.creditBalance;
        
        const phoneRecord = await (prisma as any).phoneNumber.findFirst({
          where: { companyId: member.company.id, status: "ACTIVE" }
        });
        if (phoneRecord) {
          assignedNumber = phoneRecord.number;
        } else {
          assignedNumber = "Not Assigned";
        }
      }
    }

    const accessToken = jwt.sign(
      { sub: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: "365d" }
    );

    return NextResponse.json({
      accessToken,
      access_token: accessToken,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: userAny.phone || null,
        companyId,
        contractId,
        companyStatus,
        creditBalance,
        assignedNumber,
      },
    });
  } catch (err: any) {
    console.error("POST /api/users/signin failed:", err);
    return NextResponse.json({ message: err.message || "Internal server error" }, { status: 500 });
  }
}
