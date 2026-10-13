import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "@/lib/prisma";

const JWT_SECRET = process.env.JWT_SECRET || "propnex_secret_jwt_key_2026_key";
const DUMMY_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

// ─── BUCKET SYSTEM RATE LIMITER ─────────────────────────────────────
// Limits attempts per minute per IP and per Email to block brute-force scripts
interface RateBucket {
  timestamps: number[];
}

const ipBuckets = new Map<string, RateBucket>();
const emailBuckets = new Map<string, RateBucket>();

const MAX_ATTEMPTS_PER_MINUTE = 5;
const RATE_WINDOW_MS = 60 * 1000; // 60 seconds
const MAX_CONSECUTIVE_WRONG_PASSWORDS = 5;

function pruneBucket(bucket: RateBucket): void {
  const cutoff = Date.now() - RATE_WINDOW_MS;
  bucket.timestamps = bucket.timestamps.filter((ts) => ts > cutoff);
}

function checkBucketRateLimit(key: string, map: Map<string, RateBucket>): { limited: boolean; retryAfter: number } {
  let bucket = map.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    map.set(key, bucket);
  }
  pruneBucket(bucket);
  if (bucket.timestamps.length >= MAX_ATTEMPTS_PER_MINUTE) {
    const oldest = bucket.timestamps[0];
    const retryAfter = Math.max(1, Math.ceil((oldest + RATE_WINDOW_MS - Date.now()) / 1000));
    return { limited: true, retryAfter };
  }
  return { limited: false, retryAfter: 0 };
}

function pushAttempt(key: string, map: Map<string, RateBucket>): void {
  let bucket = map.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    map.set(key, bucket);
  }
  bucket.timestamps.push(Date.now());
}

function extractClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  const cfIp = req.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();
  return "127.0.0.1";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body as { email: string; password: string };

    if (!email?.trim() || !password) {
      return NextResponse.json({ message: "Email and password are required" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const clientIp = extractClientIp(req);

    // 1. Check IP-level Bucket Rate Limiter
    const ipCheck = checkBucketRateLimit(clientIp, ipBuckets);
    if (ipCheck.limited) {
      return NextResponse.json(
        {
          message: `Too many login attempts from this network. Please wait ${ipCheck.retryAfter} seconds before trying again to protect account security.`,
          retryAfter: ipCheck.retryAfter,
        },
        { status: 429, headers: { "Retry-After": String(ipCheck.retryAfter) } }
      );
    }

    // 2. Check Email-level Bucket Rate Limiter
    const emailCheck = checkBucketRateLimit(normalizedEmail, emailBuckets);
    if (emailCheck.limited) {
      return NextResponse.json(
        {
          message: `Too many login attempts for this account. Please wait ${emailCheck.retryAfter} seconds before trying again to protect account security.`,
          retryAfter: emailCheck.retryAfter,
        },
        { status: 429, headers: { "Retry-After": String(emailCheck.retryAfter) } }
      );
    }

    // Record attempt in buckets
    pushAttempt(clientIp, ipBuckets);
    pushAttempt(normalizedEmail, emailBuckets);

    const user = await prisma.user.findUnique({ 
      where: { email: normalizedEmail },
      include: {
        memberships: {
          where: { status: "ACTIVE" },
          include: { company: { select: { id: true, contractId: true, status: true, creditBalance: true } } }
        }
      }
    });

    // 3. Timing-attack immune handling for non-existent users
    if (!user) {
      await bcrypt.compare(password, DUMMY_HASH);
      return NextResponse.json({ message: "Invalid email or password" }, { status: 401 });
    }

    const userAny = user as any;

    if (!userAny.passwordHash) {
      return NextResponse.json(
        { message: "This account uses a different sign-in method. Please contact support." },
        { status: 401 }
      );
    }

    // 4. Check if account is locked due to consecutive wrong password attempts
    const isLockedOut =
      (userAny.failedLoginAttempts ?? 0) >= MAX_CONSECUTIVE_WRONG_PASSWORDS ||
      userAny.requirePasswordReset === true ||
      (userAny.lockedUntil && new Date(userAny.lockedUntil) > new Date());

    if (isLockedOut) {
      return NextResponse.json(
        {
          message:
            "Account locked due to 5 consecutive failed login attempts. For security, an OTP verification code has been sent to your email. You must verify OTP and change your password to unlock your account.",
          locked: true,
          requireOtpReset: true,
        },
        { status: 423 }
      );
    }

    // 5. Verify Password
    const isValid = await bcrypt.compare(password, userAny.passwordHash);

    const host = req.headers.get("host") || "";
    let domainUrl = "https://propnexai.com";
    let branding: any = undefined;

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

    // 6. Handle Wrong Password
    if (!isValid) {
      const currentFailed = (userAny.failedLoginAttempts ?? 0) + 1;

      if (currentFailed >= MAX_CONSECUTIVE_WRONG_PASSWORDS) {
        // Exceeded maximum wrong password attempts -> LOCK ACCOUNT and trigger OTP flow
        const lockoutOtp = Math.floor(100000 + Math.random() * 900000).toString();
        const lockoutExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: currentFailed,
            requirePasswordReset: true,
            lockedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000), // locked until OTP reset
            resetPasswordOtp: lockoutOtp,
            resetPasswordExpires: lockoutExpires,
          }
        });

        // Send high-priority security alert & reset OTP via Apps Script Webhook
        fetch(APPS_SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "account_locked_otp",
            userEmail: user.email,
            userName: user.firstName || "User",
            otp: lockoutOtp,
            failedAttempts: currentFailed,
            domainUrl: domainUrl,
            branding: branding,
          })
        }).catch((err) => console.error("Failed to send lockout OTP alert:", err));

        // Log OTP to database
        (prisma as any).otpLog.create({
          data: {
            type: "account_locked_otp",
            email: user.email,
            otp: lockoutOtp,
            userName: user.firstName || "User",
            domain: branding?.domain || host || "propnexai.com",
            companyName: branding?.companyName || "PropNex AI",
            status: "SENT",
            expiresAt: lockoutExpires,
          }
        }).catch((e: any) => console.warn("OtpLog save failed:", e));

        return NextResponse.json(
          {
            message:
              "Account locked due to 5 consecutive failed login attempts. For security, a verification OTP has been sent to your email. You must verify OTP and change your password to unlock your account.",
            locked: true,
            requireOtpReset: true,
          },
          { status: 423 }
        );
      }

      // Less than 5 failed attempts -> update count and warn user
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: currentFailed }
      });

      const remaining = MAX_CONSECUTIVE_WRONG_PASSWORDS - currentFailed;
      return NextResponse.json(
        {
          message: `Invalid email or password. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining before account lockout.`,
          remainingAttempts: remaining,
        },
        { status: 401 }
      );
    }

    // 7. Password is valid -> reset failedLoginAttempts back to 0
    if ((userAny.failedLoginAttempts ?? 0) > 0 || userAny.lockedUntil || userAny.requirePasswordReset) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
          requirePasswordReset: false,
        }
      });
    }

    if (userAny.status === "SUSPENDED" || userAny.status === "DEACTIVATED") {
      return NextResponse.json({ message: "Your account has been suspended. Please contact support." }, { status: 403 });
    }

    const { trusted, trustedAt } = body as { trusted?: boolean; trustedAt?: string; domainUrl?: string };

    // When device is remembered/trusted, bypass OTP verification directly and issue auth token
    const effectiveTrusted = Boolean(trusted);

    if (!effectiveTrusted) {
      // Generate 2FA login OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expires = new Date(Date.now() + 10 * 60 * 1000);

      await prisma.user.update({
        where: { id: user.id },
        data: { resetPasswordOtp: otp, resetPasswordExpires: expires }
      });

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
      }).catch((err) => console.error("Failed to send login OTP:", err));

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
