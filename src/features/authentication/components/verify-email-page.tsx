"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AuthField } from "@/features/authentication/components/auth-field";
import { AuthShell } from "@/features/authentication/components/auth-shell";
import { OtpInput } from "@/features/authentication/components/otp-input";
import { AUTH_ROUTES } from "@/features/authentication/types";

export function VerifyEmailPageContent() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [message, setMessage] = useState("");

  function handleOtpChange(newOtp: string) {
    setOtp(newOtp);
    if (message) {
      setMessage("");
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      setMessage("Please enter your email address.");
      return;
    }
    if (otp.length < 6) {
      setMessage("Please enter the 6-digit OTP sent to your email.");
      return;
    }
    setMessage("");
    router.push(AUTH_ROUTES.dashboard);
  }

  function handleResend() {
    if (!email.trim()) {
      setMessage("Please enter your email address to resend the OTP.");
      return;
    }
    setMessage("A new verification OTP has been sent to your email.");
  }

  return (
    <AuthShell
      title="Verify Email"
      welcomeTitle="Almost there!"
      welcomeText="Enter your email and the verification OTP we sent you to activate your account."
      cardClassName="min-h-[460px] sm:min-h-[480px] flex flex-col justify-between"
    >
      <form className="space-y-6" onSubmit={handleSubmit}>
        <AuthField
          label="Email address"
          name="email"
          type="email"
          placeholder="Email address"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (message) setMessage("");
          }}
          required
        />

        <div className="space-y-3">
          <p className="text-center text-xs leading-relaxed text-white/60">
            Enter the 6-digit OTP sent to your email address.
          </p>
          <OtpInput
            value={otp}
            onChange={handleOtpChange}
            hasError={Boolean(message && !message.includes("sent"))}
          />
        </div>

        <div className="min-h-[20px] flex items-center justify-center">
          {message && (
            <p className="text-center text-xs text-fuchsia-300">{message}</p>
          )}
        </div>

        <button type="submit" className="auth-btn-primary">
          Verify Email
        </button>
      </form>

      <div className="mt-5 space-y-3 text-center">
        <button
          type="button"
          onClick={handleResend}
          className="text-xs text-white/70 transition hover:text-white"
        >
          Resend OTP
        </button>
        <p className="text-xs text-white/55">
          Wrong email?{" "}
          <Link href={AUTH_ROUTES.signUp} className="text-fuchsia-300 hover:text-fuchsia-200">
            Go back to Sign Up
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
