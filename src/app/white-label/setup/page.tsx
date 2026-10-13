"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, CheckCircle2, Building, Globe, Mail, Phone, Link as LinkIcon, Image as ImageIcon, Loader2, Eye, KeyRound, ArrowRight, ArrowLeft, FileText, Shield, AlertCircle } from "lucide-react";

export default function WhiteLabelSetupPage() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [userName, setUserName] = useState("User");
  const [userEmail, setUserEmail] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [expectedOtp, setExpectedOtp] = useState("");
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const errorRef = useRef<HTMLDivElement>(null);
  const [resendCountdown, setResendCountdown] = useState(0);
  const [successCountdown, setSuccessCountdown] = useState(10);

  const [formData, setFormData] = useState({
    domain: "",
    companyName: "",
    tabTitle: "",
    supportEmail: "",
    supportPhone: "",
    instagramUrl: "",
    linkedinUrl: "",
    logoUrl: "",
    faviconUrl: ""
  });

  const [cnameChecked, setCnameChecked] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const email = params.get("email") || "";
      const name = params.get("name") || "User";
      setUserEmail(email);
      setUserName(name);
    }
  }, []);

  useEffect(() => {
    let timer: any;
    if (resendCountdown > 0) {
      timer = setInterval(() => setResendCountdown((prev) => prev - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [resendCountdown]);

  useEffect(() => {
    let timer: any;
    if (success && successCountdown > 0) {
      timer = setInterval(() => setSuccessCountdown((prev) => prev - 1), 1000);
    } else if (success && successCountdown === 0) {
      window.location.href = "https://www.propnexai.com";
    }
    return () => clearInterval(timer);
  }, [success, successCountdown]);

  useEffect(() => {
    if (error && errorRef.current) {
      // Small timeout to allow the AnimatePresence to render the element first
      setTimeout(() => {
        errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
    }
  }, [error]);

  const enteredOtp = otpDigits.join("");

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newDigits = [...otpDigits];
    newDigits[index] = value.slice(-1);
    setOtpDigits(newDigits);
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      setOtpDigits(pasted.split(""));
      otpRefs.current[5]?.focus();
    }
    e.preventDefault();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, field: "logoUrl" | "faviconUrl") => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) { setError("File size must be less than 2MB"); return; }
      const reader = new FileReader();
      reader.onloadend = () => setFormData({ ...formData, [field]: reader.result as string });
      reader.readAsDataURL(file);
    }
  };

  const nextStep = () => {
    if (step === 1) {
      if (!formData.domain || !formData.companyName || !formData.supportEmail || !formData.supportPhone) {
        setError("Please fill in all required fields (Domain, Company Name, Email, Phone)."); return;
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.supportEmail)) {
        setError("Please enter a valid support email address."); return;
      }
      if (formData.supportPhone.replace(/\D/g, '').length !== 10) {
        setError("Please enter a valid 10-digit Indian phone number."); return;
      }
      setError(""); setStep(2);
    }
  };

  const requestOtp = async () => {
    if (!formData.logoUrl || !formData.faviconUrl) {
      setError("Please provide both a Logo and a Favicon (via URL or upload)."); return;
    }
    if (!formData.instagramUrl || !formData.linkedinUrl) {
      setError("Please provide both Instagram and LinkedIn URLs."); return;
    }
    const urlRegex = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/;
    if (!urlRegex.test(formData.instagramUrl) || !urlRegex.test(formData.linkedinUrl)) {
      setError("Please enter valid URLs for Instagram and LinkedIn."); return;
    }
    setError(""); setLoading(true);
    try {
      const res = await fetch("/api/white-label/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail, name: userName })
      });
      const data = await res.json();
      if (res.ok) {
        setExpectedOtp(data.otp); setOtpSent(true); setStep(3); setResendCountdown(60);
      } else {
        setError(data.error || "Failed to send OTP.");
      }
    } catch { setError("Failed to send OTP. Please try again."); }
    finally { setLoading(false); }
  };

  const submitForm = async () => {
    if (enteredOtp !== expectedOtp) {
      setError("Invalid OTP. Please check your email and try again."); return;
    }
    setError(""); setLoading(true);
    try {
      const res = await fetch("/api/white-label/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          ...formData, 
          supportPhone: `+91${formData.supportPhone.replace(/\D/g, '')}`, // Ensure +91 prefix
          userEmail, 
          name: userName 
        })
      });
      if (res.ok) { setSuccess(true); }
      else { const data = await res.json(); setError(data.error || "Something went wrong."); }
    } catch { setError("Failed to submit. Please try again."); }
    finally { setLoading(false); }
  };

  const steps = [
    { num: 1, label: "Basic Info", icon: Building },
    { num: 2, label: "Branding", icon: ImageIcon },
    { num: 3, label: "Verify", icon: Shield },
  ];

  if (success) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://propnexai.com/hero-bg.jpg')] bg-cover bg-center opacity-10" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-cyan-500/10 blur-[150px] rounded-full pointer-events-none" />
        <motion.div initial={{ opacity: 0, scale: 0.8, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: "spring", stiffness: 200, damping: 20 }}
          className="max-w-md w-full bg-zinc-950/90 backdrop-blur-2xl border border-zinc-800 rounded-3xl p-10 text-center shadow-2xl relative z-10">
          <motion.div initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
            className="w-24 h-24 bg-green-500/20 border border-green-500/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="h-12 w-12 text-green-400" />
          </motion.div>
          <h2 className="text-3xl font-bold text-white mb-3">Submission Received!</h2>
          <p className="text-zinc-400 mb-4 leading-relaxed">
            Your white-label branding details have been securely submitted to our team. You will receive a confirmation email shortly.
          </p>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-sm text-zinc-500">
            Our team will review your DNS records, validate your assets, and activate your domain. Please ensure your CNAME records remain correctly configured.
          </div>
          <div className="mt-6 text-sm font-medium text-zinc-400">
            Redirecting to PropNex AI in <span className="text-cyan-400">{successCountdown}s</span>...
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white relative overflow-x-hidden flex flex-col">
      {/* Background */}
      <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80')] bg-cover bg-center opacity-[0.04] pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-blue-600/15 blur-[160px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[600px] h-[400px] bg-cyan-500/8 blur-[120px] rounded-full pointer-events-none" />

      {/* Navbar */}
      <nav className="relative z-50 border-b border-zinc-800/60 bg-black/40 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/propnex-logo.png"
              alt="PropNex AI"
              className="h-10 sm:h-11 w-auto object-contain"
            />
            <span className="text-white font-semibold text-lg tracking-tight hidden">
              Propnex <span className="text-cyan-400">ai</span>
            </span>
          </div>
          <div className="flex items-center gap-2 bg-zinc-900/60 border border-zinc-700/50 rounded-full px-4 py-1.5">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-zinc-300 text-sm font-medium">{userName}</span>
            {userEmail && <span className="text-zinc-500 text-sm hidden sm:inline">&bull; {userEmail}</span>}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="relative z-10 max-w-2xl mx-auto px-4 py-10 sm:py-16 flex-1 w-full">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-widest mb-5">
            <Shield className="w-3.5 h-3.5" />
            White Label Platform Setup
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white mb-4 leading-tight">
            Brand it as<br /><span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400">your own.</span>
          </h1>
          <p className="text-zinc-400 max-w-lg mx-auto text-base leading-relaxed mb-6">
            Completely rebrand the PropNex AI platform with your logo, domain, and identity. Your clients will only ever see your brand.
          </p>
          <a href="https://drive.google.com/file/d/1d7T85dRtt-ll0qKtNPoKF8EXWRt5Yzsf/view?usp=sharing" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-cyan-400 hover:text-cyan-300 text-sm font-medium transition-colors bg-cyan-500/10 hover:bg-cyan-500/20 px-4 py-2 rounded-full border border-cyan-500/20">
            <FileText className="w-4 h-4" />
            View Domain Setup Guide (PDF)
          </a>
        </motion.div>

        {/* Step Indicator */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="flex items-center justify-between mb-8 relative">
          {/* Progress line */}
          <div className="absolute top-5 left-[2rem] right-[2rem] h-0.5 bg-zinc-800 z-0" />
          <div className="absolute top-5 left-[2rem] h-0.5 bg-gradient-to-r from-cyan-500 to-blue-500 z-0 transition-all duration-700"
            style={{ width: step === 1 ? "0%" : step === 2 ? "50%" : "100%" }} />
          {steps.map((s) => {
            const Icon = s.icon;
            const isActive = step === s.num;
            const isDone = step > s.num;
            return (
              <div key={s.num} className="flex flex-col items-center gap-2 z-10">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${isDone ? "bg-cyan-500 border-cyan-500" : isActive ? "bg-blue-600 border-blue-500 shadow-lg shadow-blue-500/40" : "bg-zinc-900 border-zinc-700"}`}>
                  {isDone ? <CheckCircle2 className="w-5 h-5 text-white" /> : <Icon className={`w-4 h-4 ${isActive ? "text-white" : "text-zinc-500"}`} />}
                </div>
                <span className={`text-xs font-semibold transition-colors ${isActive ? "text-white" : isDone ? "text-cyan-400" : "text-zinc-500"}`}>{s.label}</span>
              </div>
            );
          })}
        </motion.div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div ref={errorRef} initial={{ opacity: 0, height: 0, marginBottom: 0 }} animate={{ opacity: 1, height: "auto", marginBottom: 16 }} exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-xl flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0" /> <span className="pt-0.5">{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Form Card */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="bg-zinc-950/80 backdrop-blur-2xl border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">

          <AnimatePresence mode="wait">

            {/* STEP 1: Basic Info */}
            {step === 1 && (
              <motion.div key="step1" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.3 }} className="p-6 sm:p-8 space-y-5">
                <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-xl p-5 mb-2">
                  <h3 className="text-cyan-400 font-semibold flex items-center gap-2 mb-2 text-sm uppercase tracking-wider">
                    <Globe className="w-4 h-4" /> Step 1: DNS Configuration
                  </h3>
                  <p className="text-sm text-zinc-300 leading-relaxed mb-4">
                    To connect your domain to the platform, you must add the following <strong className="text-white">CNAME</strong> record to your domain's DNS settings.
                  </p>
                  <div className="bg-zinc-950/50 rounded-lg p-4 text-sm border border-zinc-800 space-y-3">
                    <div className="flex items-center justify-between border-b border-zinc-800/50 pb-3">
                      <span className="text-zinc-400 font-medium">Type:</span>
                      <span className="text-white font-mono bg-zinc-800 px-2 py-0.5 rounded">CNAME</span>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-zinc-800/50 pb-3 gap-2">
                      <span className="text-zinc-400 font-medium">Name (Host):</span>
                      <div className="text-right">
                        <span className="text-white font-mono bg-zinc-800 px-2 py-0.5 rounded">@</span>
                        <div className="text-xs text-zinc-500 mt-1 italic">If your system doesn't allow @ for CNAME, use <span className="font-mono bg-zinc-800 px-1 py-0.5 rounded text-zinc-400 not-italic">www</span></div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-zinc-400 font-medium">Value (Target):</span>
                      <span className="text-cyan-400 font-mono bg-cyan-500/10 px-2 py-0.5 rounded">cname.propnexai.com</span>
                    </div>
                  </div>
                  <p className="text-xs text-zinc-500 mt-4 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-cyan-500/50" /> Please read the <a href="https://drive.google.com/file/d/1d7T85dRtt-ll0qKtNPoKF8EXWRt5Yzsf/view?usp=sharing" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">PDF setup guide</a> for detailed instructions.
                  </p>
                </div>

                <div>
                  <h2 className="text-xl font-bold text-white mb-1">Basic Information</h2>
                  <p className="text-zinc-500 text-sm">Tell us about your domain and company.</p>
                </div>

                {/* Domain */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                    <Globe className="w-4 h-4 text-cyan-400" /> Domain Name <span className="text-red-400">*</span>
                  </label>
                  <div className="flex gap-2">
                    <input type="text" name="domain" value={formData.domain} onChange={handleInputChange}
                      placeholder="e.g. platform.yourcompany.com"
                      className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 transition-all" />
                    <button type="button" onClick={() => formData.domain && window.open(`https://${formData.domain}`, '_blank')}
                      title="Preview Domain"
                      className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-400 hover:text-white px-3 rounded-xl transition-all flex items-center justify-center">
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Company Name */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                    <Building className="w-4 h-4 text-cyan-400" /> Company Name <span className="text-red-400">*</span>
                  </label>
                  <input type="text" name="companyName" value={formData.companyName} onChange={handleInputChange}
                    placeholder="e.g. Acme Corp"
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 transition-all" />
                </div>

                {/* Support Email + Phone */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                      <Mail className="w-4 h-4 text-cyan-400" /> Support Email <span className="text-red-400">*</span>
                    </label>
                    <input type="email" name="supportEmail" value={formData.supportEmail} onChange={handleInputChange}
                      placeholder="support@company.com"
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 transition-all" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                      <Phone className="w-4 h-4 text-cyan-400" /> Support Phone <span className="text-red-400">*</span>
                    </label>
                    <div className="flex bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden focus-within:border-cyan-500 focus-within:ring-1 focus-within:ring-cyan-500/30 transition-all">
                      <div className="bg-zinc-800/50 border-r border-zinc-700 px-3 flex items-center justify-center gap-2 text-white font-medium select-none">
                        <span>🇮🇳</span>
                        <span>+91</span>
                      </div>
                      <input type="tel" name="supportPhone" value={formData.supportPhone} onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                          setFormData({ ...formData, supportPhone: val });
                        }}
                        placeholder="10-digit number"
                        className="flex-1 bg-transparent px-4 py-3 text-white text-sm placeholder-zinc-600 focus:outline-none" />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button onClick={nextStep}
                    className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold px-8 py-3 rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 hover:scale-[1.02]">
                    Next Step <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* STEP 2: Branding */}
            {step === 2 && (
              <motion.div key="step2" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.3 }} className="p-6 sm:p-8 space-y-5">
                <div>
                  <h2 className="text-xl font-bold text-white mb-1">Branding Assets</h2>
                  <p className="text-zinc-500 text-sm">Upload your logo, favicon, and social links.</p>
                </div>

                {/* Tab Title */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-zinc-300">Browser Tab Title</label>
                  <input type="text" name="tabTitle" value={formData.tabTitle} onChange={handleInputChange}
                    placeholder="e.g. Acme Dashboard"
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 transition-all" />
                </div>

                {/* Logo + Favicon */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {(["logoUrl", "faviconUrl"] as const).map((field) => (
                    <div key={field} className="space-y-2">
                      <label className="text-sm font-medium text-zinc-300 flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2">
                          <ImageIcon className="w-4 h-4 text-cyan-400" />
                          {field === "logoUrl" ? "Main Logo" : "Favicon"} <span className="text-red-400">*</span>
                        </span>
                      </label>
                      <p className="text-xs text-zinc-500 pb-1">
                        Provide an image URL or click the upload button to select a file directly. Supported formats: JPG, PNG, SVG, WEBP (Max size: 5MB).
                      </p>
                      
                      <div className="flex gap-2">
                        <input type="text" name={field} value={formData[field]} onChange={handleInputChange}
                          placeholder="Paste image URL here"
                          className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-cyan-500 transition-all" />
                        
                        <label className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 hover:text-white px-3 rounded-xl transition-all flex items-center justify-center cursor-pointer" title="Upload File">
                          <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, field)} className="hidden" />
                          <Upload className="w-4 h-4" />
                        </label>
                      </div>

                      {formData[field] && (
                        <div className="mt-2 rounded-xl border border-zinc-800 bg-zinc-900/50 flex items-center justify-center h-24 overflow-hidden p-2">
                          <img src={formData[field]} alt={field} className="max-h-full max-w-full object-contain" onError={(e) => {
                            (e.target as HTMLImageElement).src = ''; // Clear broken images
                          }} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Social Links */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { name: "instagramUrl", label: "Instagram", placeholder: "https://instagram.com/..." },
                    { name: "linkedinUrl", label: "LinkedIn", placeholder: "https://linkedin.com/..." },
                  ].map((field) => (
                    <div key={field.name} className="space-y-1.5">
                      <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                        <LinkIcon className="w-4 h-4 text-cyan-400" /> {field.label} <span className="text-red-400">*</span>
                      </label>
                      <input type="url" name={field.name} value={(formData as any)[field.name]} onChange={handleInputChange}
                        placeholder={field.placeholder}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 transition-all" />
                    </div>
                  ))}
                </div>
                <div className="space-y-3 mt-8 p-5 bg-zinc-900/40 border border-zinc-800/80 rounded-xl">
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <div className="relative flex items-center justify-center mt-0.5">
                      <input type="checkbox" className="peer appearance-none w-5 h-5 border-2 border-zinc-600 rounded bg-zinc-900 checked:bg-cyan-500 checked:border-cyan-500 transition-all cursor-pointer" checked={cnameChecked} onChange={(e) => setCnameChecked(e.target.checked)} />
                      <CheckCircle2 className="absolute w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity" />
                    </div>
                    <span className="text-sm text-zinc-300 group-hover:text-zinc-200 transition-colors">I confirm that I have completed the CNAME DNS configuration for my domain.</span>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <div className="relative flex items-center justify-center mt-0.5">
                      <input type="checkbox" className="peer appearance-none w-5 h-5 border-2 border-zinc-600 rounded bg-zinc-900 checked:bg-cyan-500 checked:border-cyan-500 transition-all cursor-pointer" checked={consentChecked} onChange={(e) => setConsentChecked(e.target.checked)} />
                      <CheckCircle2 className="absolute w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity" />
                    </div>
                    <span className="text-sm text-zinc-300 group-hover:text-zinc-200 transition-colors">I authorize the PropNex Admin team to review and deploy these branding assets.</span>
                  </label>
                </div>

                <div className="flex justify-between pt-6 mt-6 border-t border-zinc-800/50">
                  <button onClick={() => setStep(1)}
                    className="text-zinc-400 hover:text-white font-medium px-4 py-3 rounded-xl hover:bg-zinc-800 transition-all flex items-center gap-2">
                    <ArrowLeft className="w-4 h-4" /> Back
                  </button>
                  <button onClick={requestOtp} disabled={loading || !cnameChecked || !consentChecked}
                    className={`font-semibold px-8 py-3 rounded-xl transition-all flex items-center gap-2 shadow-lg ${(!cnameChecked || !consentChecked) ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed shadow-none' : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-blue-500/20 hover:shadow-blue-500/40 hover:scale-[1.02]'}`}>
                    {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending OTP...</> : <>Verify Email <Mail className="w-4 h-4" /></>}
                  </button>
                </div>
              </motion.div>
            )}

            {/* STEP 3: OTP Verify */}
            {step === 3 && (
              <motion.div key="step3" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.3 }} className="p-6 sm:p-8">
                <div className="text-center mb-8">
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
                    className="w-20 h-20 bg-blue-500/20 border border-blue-500/30 rounded-full flex items-center justify-center mx-auto mb-5">
                    <KeyRound className="w-10 h-10 text-blue-400" />
                  </motion.div>
                  <h2 className="text-2xl font-bold text-white mb-2">Check Your Email</h2>
                  <p className="text-zinc-400 text-sm max-w-sm mx-auto">
                    We sent a 6-digit verification code to{" "}
                    <span className="text-white font-semibold">{userEmail}</span>
                  </p>
                </div>

                {/* OTP Boxes */}
                <div className="flex justify-center gap-3 mb-6" onPaste={handleOtpPaste}>
                  {otpDigits.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => { otpRefs.current[index] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(index, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(index, e)}
                      className={`w-12 h-14 text-center text-xl font-bold rounded-xl border-2 bg-zinc-900 text-white outline-none transition-all duration-200
                        ${digit ? "border-cyan-500 shadow-sm shadow-cyan-500/30" : "border-zinc-700 focus:border-cyan-500 focus:shadow-sm focus:shadow-cyan-500/20"}`}
                    />
                  ))}
                </div>

                <div className="space-y-3">
                  <button onClick={submitForm} disabled={loading || enteredOtp.length < 6}
                    className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white font-semibold px-8 py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-green-500/20 hover:shadow-green-500/40 hover:scale-[1.01] disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100 disabled:shadow-none">
                    {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> Verifying & Submitting...</> : <><CheckCircle2 className="w-5 h-5" /> Complete Setup</>}
                  </button>
                </div>

                <div className="flex justify-between mt-4">
                  <button onClick={() => setStep(2)}
                    className="text-zinc-400 hover:text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-zinc-800 transition-all flex items-center gap-1.5">
                    <ArrowLeft className="w-4 h-4" /> Back to Branding
                  </button>
                  <button onClick={requestOtp} disabled={loading || resendCountdown > 0}
                    className={`text-sm font-medium px-3 py-2 rounded-lg transition-all ${resendCountdown > 0 ? 'text-zinc-600 cursor-not-allowed' : 'text-cyan-400 hover:text-cyan-300 hover:bg-zinc-800'}`}>
                    {resendCountdown > 0 ? `Resend Code (${resendCountdown}s)` : "Resend Code"}
                  </button>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </motion.div>

      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full border-t border-zinc-800/60 bg-[#0a0a0a]/80 backdrop-blur-md mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-zinc-500 text-sm">
            &copy; 2026 PropNex AI. All rights reserved.
          </p>
          <div className="flex items-center gap-6 text-sm text-zinc-500">
            <a href="https://propnexai.com/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Privacy Policy</a>
            <a href="https://propnexai.com/terms" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Terms of Service</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

