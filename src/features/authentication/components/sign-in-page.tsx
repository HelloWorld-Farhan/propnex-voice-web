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

  // Load trusted emails & devices on mount
  useEffect(() => {
    try {
      const storedEmails = JSON.parse(localStorage.getItem("trusted_emails") || "[]");
      const storedDevices = JSON.parse(localStorage.getItem("trusted_devices") || "[]");
      const deviceEmails = storedDevices.map((d: any) => (d.email || "").toLowerCase());
      const combined = Array.from(new Set([...storedEmails.map((e: string) => e.toLowerCase()), ...deviceEmails]));
      setTrustedEmails(combined);
    } catch (e) {}
  }, []);

  const isCurrentEmailTrusted = trustedEmails.includes(emailValue.toLowerCase().trim());

  function handleForgetDevice(email: string) {
    const clean = email.toLowerCase().trim();
    try {
      const storedEmails = JSON.parse(localStorage.getItem("trusted_emails") || "[]");
      const filteredEmails = storedEmails.filter((e: string) => e.toLowerCase() !== clean);
      localStorage.setItem("trusted_emails", JSON.stringify(filteredEmails));

      const storedDevices = JSON.parse(localStorage.getItem("trusted_devices") || "[]");
      const filteredDevices = storedDevices.filter((d: any) => (d.email || "").toLowerCase() !== clean);
      localStorage.setItem("trusted_devices", JSON.stringify(filteredDevices));

      setTrustedEmails(filteredEmails.map((e: string) => e.toLowerCase()));
      setRememberMe(false);
    } catch {}
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    
    const formData = new FormData(e.currentTarget);
    const email = (formData.get("email") as string).toLowerCase().trim();
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
      const isTrusted = isCurrentEmailTrusted || rememberMe;

      // Get timestamp of trust
      let trustedAt: string = new Date().toISOString();
      if (isCurrentEmailTrusted) {
        try {
          const devices: { email: string; trustedAt: string }[] = JSON.parse(localStorage.getItem("trusted_devices") || "[]");
          const device = devices.find(d => (d.email || "").toLowerCase() === email);
          if (device?.trustedAt) trustedAt = device.trustedAt;
        } catch {}
      }

      const response = await axios.post(`/api/users/signin`, {
        email,
        password,
        trusted: isTrusted,
        trustedAt,
        domainUrl: window.location.origin,
      });

      const data = response.data;

      if (data.requireOtp) {
        localStorage.setItem("login_email", email);
        if (rememberMe || isCurrentEmailTrusted) {
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

      // If user selected rememberMe or was already trusted, ensure it is stored
      if (isTrusted) {
        try {
          const storedEmails = JSON.parse(localStorage.getItem("trusted_emails") || "[]");
          if (!storedEmails.map((e: string) => e.toLowerCase()).includes(email)) {
            storedEmails.push(email);
            localStorage.setItem("trusted_emails", JSON.stringify(storedEmails));
          }
          let storedDevices = JSON.parse(localStorage.getItem("trusted_devices") || "[]");
          storedDevices = storedDevices.filter((d: any) => (d.email || "").toLowerCase() !== email);
          storedDevices.push({ email, trustedAt: new Date().toISOString() });
          localStorage.setItem("trusted_devices", JSON.stringify(storedDevices));
        } catch {}
      }

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
    <AuthShell
      title="Login"
      cardClassName="min-h-[480px] sm:min-h-[500px] flex flex-col justify-between"
    >
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
          onChange={(e: any) => {
            setEmailValue(e.target.value);
            if (errors.email || errors.root) setErrors((prev) => ({ ...prev, email: "", root: "" }));
          }}
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
          onChange={() => {
            if (errors.password || errors.root) setErrors((prev) => ({ ...prev, password: "", root: "" }));
          }}
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
          <div className="flex items-center justify-between text-xs text-fuchsia-400 bg-fuchsia-500/[0.08] border border-fuchsia-500/30 rounded-xl p-3 transition-all">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              <span className="font-medium text-white/90">Device remembered for this email</span>
            </div>
            <button
              type="button"
              onClick={() => handleForgetDevice(emailValue)}
              className="text-[11px] text-white/50 hover:text-white/90 underline transition cursor-pointer"
              title="Forget this device"
            >
              Forget
            </button>
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
