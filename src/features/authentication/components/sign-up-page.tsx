"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import axios from "axios";
import PhoneInput, { isValidPhoneNumber } from "react-phone-number-input";
import "react-phone-number-input/style.css";

import { AuthField } from "@/features/authentication/components/auth-field";
import { AuthShell } from "@/features/authentication/components/auth-shell";
import { AuthSocialButtons } from "@/features/authentication/components/auth-social-buttons";
import { AUTH_ROUTES } from "@/features/authentication/types";
import { useBrand } from "@/components/providers/brand-provider";
import {
  PasswordRequirements,
  getPasswordChecks,
} from "@/features/authentication/components/password-requirements";

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;

export function SignUpPageContent() {
  const brand = useBrand();
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [phone, setPhone] = useState<string | undefined>("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const { checks, passedCount, isStrong } = getPasswordChecks(password);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});

    const formData = new FormData(e.currentTarget);
    const firstName = formData.get("firstName") as string;
    const lastName = formData.get("lastName") as string;
    const email = (formData.get("email") as string).toLowerCase();
    const pw = formData.get("password") as string;
    const confirmPw = formData.get("confirmPassword") as string;

    const newErrors: Record<string, string> = {};

    if (!firstName.trim()) newErrors.firstName = "First name is required";
    if (!lastName.trim()) newErrors.lastName = "Last name is required";

    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      newErrors.email = "Please enter a valid email address";
    }

    if (!phone) {
      newErrors.phone = "Phone number is required";
    } else if (!isValidPhoneNumber(phone)) {
      newErrors.phone = "Please enter a valid phone number for this country";
    }

    if (!pw) {
      newErrors.password = "Password is required";
    } else if (!PASSWORD_REGEX.test(pw)) {
      newErrors.password = "Must be 8+ chars with uppercase, lowercase, number & symbol";
    }

    if (pw !== confirmPw) {
      newErrors.confirmPassword = "Passwords do not match";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setSubmitting(true);
    try {
      const response = await axios.post(`/api/users/signup`, {
        firstName,
        lastName,
        email,
        phone,
        password: pw,
        confirmPassword: confirmPw,
      });

      if (response.data?.requireOtp) {
        localStorage.setItem("signup_email", email);
        router.push(`${AUTH_ROUTES.verifyOtp}?purpose=signup-verification`);
        return;
      }

      router.replace(AUTH_ROUTES.signIn);
    } catch (err: any) {
      const responseData = err.response?.data;
      const errorMsg = responseData?.message
        ? Array.isArray(responseData.message) ? responseData.message.join(", ") : responseData.message
        : err.message || "Registration failed";
      setErrors({ root: errorMsg });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Sign Up"
      welcomeTitle={`Join ${brand.companyName || "PropNex AI"}`}
      welcomeText="Create your account to access voice agents, campaigns, and analytics. Complete verification to activate your workspace."
      cardClassName="min-h-[580px] sm:min-h-[610px] flex flex-col justify-between"
    >
      <form className="space-y-3" onSubmit={handleSubmit} noValidate>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AuthField
            label="First name"
            name="firstName"
            type="text"
            placeholder="First name"
            autoComplete="given-name"
            disabled={submitting}
            error={errors.firstName}
            onChange={() => errors.firstName && setErrors((prev) => ({ ...prev, firstName: "" }))}
            required
          />
          <AuthField
            label="Last name"
            name="lastName"
            type="text"
            placeholder="Last name"
            autoComplete="family-name"
            disabled={submitting}
            error={errors.lastName}
            onChange={() => errors.lastName && setErrors((prev) => ({ ...prev, lastName: "" }))}
            required
          />
        </div>

        <AuthField
          label="Email address"
          name="email"
          type="email"
          placeholder="Email address"
          autoComplete="email"
          disabled={submitting}
          error={errors.email}
          onChange={() => errors.email && setErrors((prev) => ({ ...prev, email: "" }))}
          required
        />

        <div className="space-y-2 block">
          <label className="sr-only">Phone number</label>
          <PhoneInput
            international
            defaultCountry="IN"
            value={phone}
            onChange={(val) => {
              setPhone(val);
              if (errors.phone) setErrors((prev) => ({ ...prev, phone: "" }));
            }}
            disabled={submitting}
            className={`auth-input flex items-center gap-2 [&>input]:bg-transparent [&>input]:outline-none [&>input]:text-white [&>input]:w-full ${errors.phone ? "border-red-500 focus-within:ring-1 focus-within:ring-red-500 focus-within:border-red-500" : ""}`}
          />
          {errors.phone && <p className="text-xs text-red-400 mt-1">{errors.phone}</p>}
        </div>

        {/* Password + animated smooth criteria (No page height jump) */}
        <div>
          <AuthField
            label="Password"
            name="password"
            type="password"
            placeholder="Password"
            autoComplete="new-password"
            disabled={submitting}
            error={errors.password}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (errors.password) setErrors((prev) => ({ ...prev, password: "" }));
            }}
            required
          />
          <PasswordRequirements
            checks={checks}
            passedCount={passedCount}
            visible={password.length > 0}
          />
        </div>

        {/* Confirm password with smooth match indicator */}
        <div>
          <AuthField
            label="Confirm password"
            name="confirmPassword"
            type="password"
            placeholder="Confirm password"
            autoComplete="new-password"
            disabled={submitting}
            error={password && confirmPassword && password !== confirmPassword ? " " : errors.confirmPassword}
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              if (errors.confirmPassword) setErrors((prev) => ({ ...prev, confirmPassword: "" }));
            }}
            required
          />
          <div
            className={`transition-all duration-200 ease-in-out overflow-hidden flex justify-center ${
              password && confirmPassword
                ? "max-h-8 opacity-100 mt-1"
                : "max-h-0 opacity-0 mt-0 pointer-events-none"
            }`}
          >
            {password === confirmPassword ? (
              <div
                style={{
                  borderRadius: "9999px",
                  border: "1px solid rgba(16,185,129,0.3)",
                  background: "rgba(16,185,129,0.07)",
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-0.5 text-[11px] font-medium text-emerald-400"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Passwords match
              </div>
            ) : (
              <div
                style={{
                  borderRadius: "9999px",
                  border: "1px solid rgba(239,68,68,0.3)",
                  background: "rgba(239,68,68,0.07)",
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-0.5 text-[11px] font-medium text-red-400"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Passwords do not match
              </div>
            )}
          </div>
        </div>

        {errors.root && (
          <p className="text-center text-xs text-red-400 mt-1">{errors.root}</p>
        )}

        <button type="submit" disabled={submitting || !isStrong} className="auth-btn-primary mt-2 disabled:opacity-50">
          {submitting ? "Creating Account..." : "Create Account"}
        </button>
      </form>

      <div className="mt-5 space-y-4 text-center">
        <p className="text-xs text-white/55">
          Already have an account?{" "}
          <Link href={AUTH_ROUTES.signIn} className="text-fuchsia-300 hover:text-fuchsia-200">Sign in</Link>
        </p>
      </div>
    </AuthShell>
  );
}
