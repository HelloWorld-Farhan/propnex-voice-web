"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import axios from "axios";

import { AuthField } from "@/features/authentication/components/auth-field";
import { AuthShell } from "@/features/authentication/components/auth-shell";
import { AuthSocialButtons } from "@/features/authentication/components/auth-social-buttons";
import { AUTH_ROUTES } from "@/features/authentication/types";

export function SignInPageContent() {
  const router = useRouter();
  const [rememberMe, setRememberMe] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [isLockedOut, setIsLockedOut] = useState(false);

  const [emailValue, setEmailValue] = useState("");
  const [trustedEmails, setTrustedEmails] = useState<string[]>([]);

  // Load trusted emails on mount
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("trusted_emails") || "[]");
      setTrustedEmails(stored);
    } catch (e) {}
  }, []);

  const isCurrentEmailTrusted = trustedEmails.includes(emailValue.toLowerCase());

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    
    const formData = new FormData(e.currentTarget);
    const email = (formData.get("email") as string).toLowerCase();
    const password = formData.get("password") as string;

    const newErrors: Record<string, string> = {};
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      newErrors.email = "Please enter a valid email address";
    }
    if (!password) {
      newErrors.password = "Password is required";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setSubmitting(true);

    try {
      const isTrusted = isCurrentEmailTrusted;

      // Get the timestamp when this device was trusted (from trusted_devices)
      let trustedAt: string | null = null;
      if (isTrusted) {
        try {
          const devices: { email: string; trustedAt: string }[] = JSON.parse(localStorage.getItem("trusted_devices") || "[]");
          const device = devices.find(d => d.email === email.toLowerCase());
          trustedAt = device?.trustedAt || null;
        } catch {}
      }

      const response = await axios.post(`/api/users/signin`, {
        email,
        password,
        trusted: isTrusted,
        trustedAt,   // ISO timestamp — server verifies this is AFTER any force-logout
        domainUrl: window.location.origin,
      });

      const data = response.data;

      if (data.requireOtp) {
        localStorage.setItem("login_email", email);
        if (rememberMe) {
          localStorage.setItem("login_remember_me", "true");
        } else {
          localStorage.removeItem("login_remember_me");
        }
        router.push(`${AUTH_ROUTES.verifyOtp}?purpose=login-verification`);
        return;
      }

      // Store tokens and user profile
      localStorage.setItem("accessToken", data.accessToken);
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("user", JSON.stringify(data.user));

      router.replace(AUTH_ROUTES.dashboard);
    } catch (err: any) {
      const responseData = err.response?.data;
      const errorMsg = responseData?.message 
        ? (Array.isArray(responseData.message) ? responseData.message.join(", ") : responseData.message)
        : (err.message || "Invalid email or password");
      setErrors({ root: errorMsg });
      if (responseData?.requireOtpReset || responseData?.locked || err.response?.status === 423) {
        setIsLockedOut(true);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell title="Login">
      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        <AuthField
          label="Email address"
          name="email"
          type="email"
          placeholder="Email address"
          autoComplete="email"
          disabled={submitting}
          required
          value={emailValue}
          onChange={(e: any) => setEmailValue(e.target.value)}
          error={errors.email}
        />

        <AuthField
          label="Password"
          name="password"
          type="password"
          placeholder="Password"
          autoComplete="current-password"
          disabled={submitting}
          error={errors.password}
          required
        />

        {!isCurrentEmailTrusted && (
          <div
            role="button"
            tabIndex={0}
            onClick={() => !submitting && setRememberMe(!rememberMe)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (!submitting) setRememberMe(!rememberMe);
              }
            }}
            className={`group relative flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-all duration-200 select-none ${
              rememberMe
                ? "border-fuchsia-500/60 bg-fuchsia-500/[0.07] shadow-[0_0_15px_rgba(217,70,239,0.12)]"
                : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
            }`}
          >
            <div className="relative flex items-center pt-0.5">
              <input
                type="checkbox"
                id="rememberMe"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                disabled={submitting}
                className="sr-only"
              />
              <div
                className={`flex size-4.5 shrink-0 items-center justify-center rounded-md border transition-all duration-200 ${
                  rememberMe
                    ? "border-fuchsia-500 bg-gradient-to-tr from-fuchsia-600 to-purple-600 text-white shadow-sm"
                    : "border-white/30 bg-black/40 group-hover:border-fuchsia-400/60"
                }`}
              >
                {rememberMe && (
                  <svg
                    className="size-3 stroke-[3]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-semibold text-white/90">
                Remember this device
              </span>
              <span className="text-[11px] text-white/50 leading-relaxed">
                Save this device to skip OTP verification for future logins.
              </span>
            </div>
          </div>
        )}

        {isCurrentEmailTrusted && (
          <div className="flex items-center gap-2 text-sm text-fuchsia-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            Device remembered for this email
          </div>
        )}

        {isLockedOut ? (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3.5 text-left space-y-2">
            <div className="flex items-center gap-2 text-rose-300 font-semibold text-xs">
              <svg className="size-4 shrink-0 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>Account Locked (5 Failed Attempts)</span>
            </div>
            <p className="text-[11px] text-white/75 leading-relaxed">
              To protect your account from unauthorized password guessing, normal login is disabled. A verification OTP has been sent to your email.
            </p>
            <button
              type="button"
              onClick={() => {
                localStorage.setItem("reset_email", emailValue);
                router.push(`${AUTH_ROUTES.verifyOtp}?purpose=password-reset`);
              }}
              className="w-full mt-1 py-2 px-3 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition shadow-md"
            >
              Verify OTP & Reset Password &rarr;
            </button>
          </div>
        ) : errors.root ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-center text-xs text-red-400">
            {errors.root}
          </div>
        ) : null}

        <button type="submit" disabled={submitting || isLockedOut} className="auth-btn-primary disabled:opacity-50">
          {submitting ? "Logging in..." : "Login"}
        </button>
      </form>

      <div className="mt-5 space-y-4 text-center">
        <Link
          href={AUTH_ROUTES.resetPassword}
          className="text-xs text-white/70 transition hover:text-white"
        >
          Forget Password?
        </Link>

        <p className="text-xs text-white/55">
          New here?{" "}
          <Link href={AUTH_ROUTES.signUp} className="text-fuchsia-300 hover:text-fuchsia-200">
            Create account
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
