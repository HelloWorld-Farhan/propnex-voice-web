"use client";

import { useRef } from "react";

type OtpInputProps = {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  hasError?: boolean;
};

export function OtpInput({ length = 6, value, onChange, hasError }: OtpInputProps) {
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const digits = value.padEnd(length, " ").slice(0, length).split("");

  function updateAt(index: number, char: string) {
    const next = digits.map((d, i) => (i === index ? char : d.trim())).join("");
    onChange(next.replace(/\s/g, "").slice(0, length));
  }

  function handleChange(index: number, raw: string) {
    const char = raw.replace(/\D/g, "").slice(-1);
    updateAt(index, char);
    if (char && index < length - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (!digits[index]?.trim() && index > 0) {
        inputsRef.current[index - 1]?.focus();
        updateAt(index - 1, "");
      } else {
        updateAt(index, "");
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputsRef.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < length - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (pasted) {
      onChange(pasted);
      const focusIndex = Math.min(pasted.length, length - 1);
      inputsRef.current[focusIndex]?.focus();
    }
  }

  return (
    <div className="flex justify-center gap-1.5 sm:gap-2">
      {Array.from({ length }).map((_, index) => (
        <input
          key={index}
          ref={(el) => {
            inputsRef.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          value={digits[index]?.trim() ?? ""}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          className={`auth-otp-input transition-all duration-200 ${
            hasError ? "border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.25)]" : ""
          }`}
          aria-label={`OTP digit ${index + 1}`}
        />
      ))}
    </div>
  );
}
