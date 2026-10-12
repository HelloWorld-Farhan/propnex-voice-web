import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";

const APPS_SCRIPT_URL =
  process.env.APPS_SCRIPT_WEBHOOK_URL ||
  process.env.GOOGLE_APPS_SCRIPT_URL ||
  "https://script.google.com/macros/s/AKfycbz2zj_l7vcmiPZKuYqEVdso0apyW3aDJZZWTVTJ1jRrQr8PLGZIH_TzRpTLFskphIwgDQ/exec";

export async function POST(req: NextRequest) {
  try {
    const { email, otp, newPassword, domainUrl } = await req.json();

    if (!email || !otp || !newPassword) {
      return NextResponse.json({ message: "Missing required fields" }, { status: 400 });
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      return NextResponse.json({ message: "Password must be at least 8 characters long and include an uppercase letter, a lowercase letter, a number, and a symbol." }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        memberships: {
          where: { status: "ACTIVE" },
          take: 1
        }
      }
    });

    if (!user) {
      return NextResponse.json({ message: "Invalid request" }, { status: 400 });
    }

    if (user.resetPasswordOtp !== otp) {
      return NextResponse.json({ message: "Invalid OTP" }, { status: 400 });
    }

    if (!user.resetPasswordExpires || user.resetPasswordExpires < new Date()) {
      return NextResponse.json({ message: "OTP has expired" }, { status: 400 });
    }

    if (user.passwordHash) {
      const isSamePassword = await bcrypt.compare(newPassword, user.passwordHash);
      if (isSamePassword) {
        return NextResponse.json({ message: "Password is the same as the previous one and cannot be used" }, { status: 400 });
      }
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetPasswordOtp: null,
        resetPasswordExpires: null,
      },
    });

    // Record system event
    let companyId = null;
    if (user.memberships && user.memberships.length > 0) {
      companyId = user.memberships[0].companyId;
    }

    const domain = domainUrl ? new URL(domainUrl).hostname : "propnexai.com";

    await (prisma as any).systemEvent.create({
      data: {
        type: "USER_PASSWORD_CHANGED",
        title: "Password Changed",
        message: `${user.email} changed their password via domain ${domain}`,
        companyId: companyId,
        payload: { email: user.email, domain: domain }
      }
    }).catch((e: any) => console.error("Failed to log system event", e));

    // Send Success Email - NON BLOCKING
    fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "password_changed_success",
        userEmail: user.email,
        userName: user.firstName || "User",
        domainUrl: domainUrl || "https://propnexai.com"
      })
    }).catch(e => console.warn(`Webhook password_changed_success failed: ${e}`));

    return NextResponse.json({ message: "Password updated successfully" }, { status: 200 });
  } catch (err: any) {
    console.error("POST /api/users/reset-password failed:", err);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
