"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { AuthField } from "@/features/authentication/components/auth-field";
import { AuthShell } from "@/features/authentication/components/auth-shell";
import { AUTH_ROUTES } from "@/features/authentication/types";

type ResetStep = "email" | "new-password";

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;

export function ResetPasswordPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const step = (searchParams.get("step") as ResetStep) ?? "email";

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [confirmChange, setConfirmChange] = useState(false);

  // Password state for new-password step
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const checks = {
    length: newPassword.length >= 8,
    upper: /[A-Z]/.test(newPassword),
    lower: /[a-z]/.test(newPassword),
    number: /\d/.test(newPassword),
    symbol: /[\W_]/.test(newPassword),
  };
  const passedCount = Object.values(checks).filter(Boolean).length;
  const isStrong = passedCount === 5;
  const strengthLabel = passedCount <= 2 ? "Weak" : passedCount === 3 ? "Fair" : passedCount === 4 ? "Good" : "Strong \u2713";
  const strengthColor = passedCount <= 2 ? "text-red-400" : passedCount === 3 ? "text-amber-400" : passedCount === 4 ? "text-yellow-300" : "text-emerald-400";
  const barColor = passedCount <= 2 ? "bg-red-500" : passedCount === 3 ? "bg-amber-500" : passedCount === 4 ? "bg-yellow-400" : "bg-emerald-400";

  async function handleEmailSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    setEmailError("");

    if (!confirmChange) {
      setMessage("Please confirm you want to change your password.");
      return;
    }

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;

    if (!email) {
      setEmailError("Email is required");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/users/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, domainUrl: window.location.origin }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.message && data.message.toLowerCase().includes("not found")) {
          setEmailError(data.message);
        } else {
          setMessage(data.message || "Something went wrong.");
        }
        return;
      }

      localStorage.setItem("reset_email", email);
      router.push(`${AUTH_ROUTES.verifyOtp}?purpose=password-reset`);
    } catch (error) {
      setMessage("Failed to connect. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");

    if (!PASSWORD_REGEX.test(newPassword)) {
      setMessage("Password must be at least 8 characters long and include an uppercase letter, a lowercase letter, a number, and a symbol.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    const email = localStorage.getItem("reset_email");
    const otp = localStorage.getItem("reset_otp");

    if (!email || !otp) {
      setMessage("Session expired. Please restart the process.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/users/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp, newPassword, domainUrl: window.location.origin }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.message || "Failed to reset password.");
        return;
      }

      localStorage.removeItem("reset_email");
      localStorage.removeItem("reset_otp");
      router.replace(AUTH_ROUTES.signIn + "?reset=success");
    } catch (error) {
      setMessage("Failed to connect. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (step === "new-password") {
    return (
      <AuthShell
        title="Reset Password"
        welcomeTitle="Set a new password"
        welcomeText="Your OTP has been verified. Enter a strong new password for your account."
      >
        <form className="space-y-4" onSubmit={handlePasswordSubmit}>
          {/* New password + live strength meter */}
          <div className="space-y-2">
            <AuthField
              label="New password"
              name="newPassword"
              type="password"
              placeholder="New password"
              autoComplete="new-password"
              required
              disabled={loading}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            {newPassword.length > 0 && (
              <div style={{ borderRadius: "1rem", border: "1px solid rgba(217,70,239,0.25)", background: "rgba(217,70,239,0.05)", padding: "0.85rem 1.25rem" }} className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1 flex-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-all duration-300 ${passedCount >= i ? barColor : "bg-white/10"}`}
                      />
                    ))}
                  </div>
                  <span className={`text-xs font-semibold shrink-0 ${strengthColor}`}>{strengthLabel}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 pt-0.5">
                  {[
                    { key: "length", label: "8+ characters" },
                    { key: "upper",  label: "Uppercase (A\u2013Z)" },
                    { key: "lower",  label: "Lowercase (a\u2013z)" },
                    { key: "number", label: "Number (0\u20139)" },
                    { key: "symbol", label: "Symbol (!@#$...)" },
                  ].map(({ key, label }) => {
                    const ok = (checks as any)[key];
                    return (
                      <div key={key} className={`flex items-center gap-1.5 text-[11px] transition-colors ${ok ? "text-emerald-400" : "text-white/35"}`}>
                        {ok ? (
                          <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        ) : (
                          <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /></svg>
                        )}
                        {label}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Confirm password */}
          <div className="space-y-1">
            <AuthField
              label="Confirm new password"
              name="confirmPassword"
              type="password"
              placeholder="Confirm new password"
              autoComplete="new-password"
              required
              disabled={loading}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            {newPassword && confirmPassword && (
              <div className="flex justify-center pt-1">
                {newPassword === confirmPassword ? (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-medium text-emerald-400">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    Passwords match
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-[11px] font-medium text-red-400">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    Passwords do not match
                  </div>
                )}
              </div>
            )}
          </div>

          {message && (
            <p className="text-center text-xs text-red-400">{message}</p>
          )}

          <button type="submit" className="auth-btn-primary" disabled={loading || !isStrong}>
            {loading ? "Updating..." : "Update Password"}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-white/55">
          <Link href={AUTH_ROUTES.signIn} className="text-fuchsia-300 hover:text-fuchsia-200">
            Back to Sign In
          </Link>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset Password"
      welcomeTitle="Forgot password?"
      welcomeText="Enter your registered email address. We will send a password-reset OTP to verify your identity."
    >
      <form className="space-y-4" onSubmit={handleEmailSubmit}>
        <AuthField
          label="Registered email address"
          name="email"
          type="email"
          placeholder="Registered email address"
          autoComplete="email"
          required
          disabled={loading}
          error={emailError}
        />

        <div
          role="button"
          tabIndex={0}
          onClick={() => !loading && setConfirmChange(!confirmChange)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              if (!loading) setConfirmChange(!confirmChange);
            }
          }}
          className={`group relative flex cursor-pointer items-start gap-3.5 rounded-xl border p-3.5 transition-all duration-200 select-none ${
            confirmChange
              ? "border-fuchsia-500/70 bg-fuchsia-500/[0.08] shadow-[0_0_20px_rgba(217,70,239,0.14)]"
              : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
          }`}
        >
          <div className="relative flex items-center pt-0.5">
            <input
              type="checkbox"
              id="confirmChange"
              checked={confirmChange}
              onChange={(e) => setConfirmChange(e.target.checked)}
              disabled={loading}
              className="sr-only"
            />
            <div
              className={`flex size-5 shrink-0 items-center justify-center rounded-md border transition-all duration-200 ${
                confirmChange
                  ? "border-fuchsia-500 bg-gradient-to-tr from-fuchsia-600 to-purple-600 text-white shadow-sm"
                  : "border-white/30 bg-black/40 group-hover:border-fuchsia-400/60"
              }`}
            >
              {confirmChange && (
                <svg
                  className="size-3.5 stroke-[3]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white/95 tracking-wide">
                I want to change my password
              </span>
              <span className="rounded-full bg-fuchsia-500/20 px-2 py-0.5 text-[10px] font-medium text-fuchsia-300">
                Security
              </span>
            </div>
            <p className="text-xs text-white/55 leading-relaxed">
              Confirm that you are authorizing a one-time verification OTP to be sent to this email address to reset your account password.
            </p>
          </div>
        </div>

        {message && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-center text-xs text-red-400">
            {message}
          </div>
        )}

        <button type="submit" className="auth-btn-primary disabled:opacity-50" disabled={loading || !confirmChange}>
          {loading ? "Sending..." : "Send Reset OTP"}
        </button>
      </form>

      <p className="mt-5 text-center text-xs text-white/55">
        Remember your password?{" "}
        <Link href={AUTH_ROUTES.signIn} className="text-fuchsia-300 hover:text-fuchsia-200">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
