"use client";

import React from "react";

export type PasswordChecks = {
  length: boolean;
  upper: boolean;
  lower: boolean;
  number: boolean;
  symbol: boolean;
};

export function getPasswordChecks(password: string): { checks: PasswordChecks; passedCount: number; isStrong: boolean } {
  const checks: PasswordChecks = {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /\d/.test(password),
    symbol: /[\W_]/.test(password),
  };
  const passedCount = Object.values(checks).filter(Boolean).length;
  const isStrong = passedCount === 5;
  return { checks, passedCount, isStrong };
}

type PasswordRequirementsProps = {
  checks: PasswordChecks;
  passedCount: number;
  visible: boolean;
};

export function PasswordRequirements({ checks, passedCount, visible }: PasswordRequirementsProps) {
  const strengthLabel =
    passedCount <= 2 ? "Weak" : passedCount === 3 ? "Fair" : passedCount === 4 ? "Good" : "Strong ✓";
  const strengthColor =
    passedCount <= 2
      ? "text-red-400"
      : passedCount === 3
      ? "text-amber-400"
      : passedCount === 4
      ? "text-yellow-300"
      : "text-emerald-400";
  const barColor =
    passedCount <= 2
      ? "bg-red-500"
      : passedCount === 3
      ? "bg-amber-500"
      : passedCount === 4
      ? "bg-yellow-400"
      : "bg-emerald-400";

  return (
    <div
      className={`transition-all duration-300 ease-in-out overflow-hidden ${
        visible
          ? "max-h-48 opacity-100 scale-100 my-2"
          : "max-h-0 opacity-0 scale-95 my-0 pointer-events-none"
      }`}
    >
      <div
        style={{
          borderRadius: "0.875rem",
          border: "1px solid rgba(217,70,239,0.25)",
          background: "rgba(217,70,239,0.05)",
          padding: "0.75rem 1rem",
        }}
        className="space-y-2 backdrop-blur-sm shadow-inner"
      >
        {/* Strength bar row */}
        <div className="flex items-center gap-3">
          <div className="flex gap-1 flex-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                  passedCount >= i ? barColor : "bg-white/10"
                }`}
              />
            ))}
          </div>
          <span className={`text-[11px] font-semibold shrink-0 transition-colors duration-300 ${strengthColor}`}>
            {strengthLabel}
          </span>
        </div>

        {/* Rule checklist */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 pt-0.5">
          {[
            { key: "length", label: "8+ characters" },
            { key: "upper", label: "Uppercase (A–Z)" },
            { key: "lower", label: "Lowercase (a–z)" },
            { key: "number", label: "Number (0–9)" },
            { key: "symbol", label: "Symbol (!@#$...)" },
          ].map(({ key, label }) => {
            const ok = checks[key as keyof PasswordChecks];
            return (
              <div
                key={key}
                className={`flex items-center gap-1.5 text-[11px] transition-colors duration-200 ${
                  ok ? "text-emerald-400 font-medium" : "text-white/35"
                }`}
              >
                {ok ? (
                  <svg
                    className="w-3 h-3 shrink-0 text-emerald-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg
                    className="w-3 h-3 shrink-0 text-white/30"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <circle cx="12" cy="12" r="9" />
                  </svg>
                )}
                <span>{label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
