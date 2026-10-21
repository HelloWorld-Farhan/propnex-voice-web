import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import prisma from "@/lib/prisma";

const JWT_SECRET = process.env.JWT_SECRET || "propnex_secret_jwt_key_2026_key";

export async function POST(req: NextRequest) {
  try {
    const { email, otp } = await req.json();

    if (!email?.trim() || !otp) {
      return NextResponse.json({ message: "Email and OTP are required" }, { status: 400 });
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
      return NextResponse.json({ message: "Invalid email or OTP" }, { status: 401 });
    }

    if (user.resetPasswordOtp !== otp) {
      return NextResponse.json({ message: "Invalid OTP" }, { status: 401 });
    }

    if (!user.resetPasswordExpires || user.resetPasswordExpires < new Date()) {
      return NextResponse.json({ message: "OTP has expired" }, { status: 401 });
    }

    if (user.status === "SUSPENDED" || user.status === "DEACTIVATED") {
      return NextResponse.json({ message: "Your account has been suspended. Please contact support." }, { status: 403 });
    }

    if (user.requirePasswordReset) {
      return NextResponse.json({
        message: "Your account is locked due to consecutive failed login attempts. Please reset your password to proceed.",
        requireOtpReset: true
      }, { status: 423 });
    }

    // Clear OTP and reset security counters
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordOtp: null,
        resetPasswordExpires: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
        requirePasswordReset: false,
      }
    });

    let companyId: string | null = null;
    let contractId: string | null = null;
    let companyStatus: string | null = null;
    let creditBalance: any = undefined;
    let assignedNumber: string | null = null;

    if (user.memberships && user.memberships.length > 0) {
      const member = user.memberships[0];
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

    const deviceTrustToken = jwt.sign(
      {
        sub: user.id,
        email: user.email.toLowerCase(),
        pswSig: user.passwordHash ? user.passwordHash.slice(-10) : "default",
        type: "device_trust"
      },
      JWT_SECRET,
      { expiresIn: "365d" }
    );

    return NextResponse.json({
      accessToken,
      access_token: accessToken,
      deviceTrustToken,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: (user as any).phone || null,
        companyId,
        contractId,
        companyStatus,
        creditBalance,
        assignedNumber,
      },
    });
  } catch (err: any) {
    console.error("POST /api/users/signin-verify failed:", err);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
