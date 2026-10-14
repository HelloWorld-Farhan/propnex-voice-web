"use client";

import {
  CheckCircle2,
  Clock,
  Pause,
  PhoneOutgoing,
  Play,
  Sparkles,
  Upload,
  Users,
  Info,
  Pencil,
  Check,
  X,
  Trash2,
  CalendarClock,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  ListChecks,
  ChevronLeft,
  ChevronRight,
  Search,
  StopCircle
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { isValidPhoneNumber } from "react-phone-number-input";
import type { Campaign } from "@/features/outbound/types";
import { cn } from "@/lib/utils";

const statusConfig: Record<
  Campaign["status"],
  { label: string; color: string; bgColor: string }
> = {
  idle: { label: "No Campaign", color: "text-muted-foreground", bgColor: "bg-muted" },
  scheduled: { label: "Scheduled", color: "text-amber-500", bgColor: "bg-amber-500/10" },
  ready: { label: "Ready to Start", color: "text-amber-500", bgColor: "bg-amber-500/10" },
  running: { label: "Running", color: "text-primary", bgColor: "bg-primary/10" },
  paused: { label: "Paused", color: "text-amber-500", bgColor: "bg-amber-500/10" },
  completed: { label: "Completed", color: "text-emerald-500", bgColor: "bg-emerald-500/10" },
  force_stopped: { label: "Force Stopped", color: "text-destructive", bgColor: "bg-destructive/10" },
  failed: { label: "Failed", color: "text-destructive", bgColor: "bg-destructive/10" },
};

type CampaignCardProps = {
  campaign: Campaign;
  progressPercent: number;
  onUploadClick: () => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onClear?: () => void;
  onForceStop?: () => void;
  onEditLead?: (index: number, newLead: any) => void;
  onDeleteLead?: (index: number) => void;
  onSchedule?: () => void;
  onEditSchedule?: (idx: number) => void;
  onDeleteSchedule?: (idx: number) => void;
  displaySchedules?: any[];
  failedCallsCount?: number;
  disableSchedule?: boolean;
  scheduleDisabledReason?: string;
  hasOutboundNumber?: boolean;
  className?: string;
  companyId?: string;
  callHistory?: any[];
};

function LeadRow({ lead, idx, onSave, onDelete, campaignStatus }: { lead: any; idx: number; onSave: (newLead: any) => void; onDelete?: () => void, campaignStatus?: string }) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(lead.name);
  const [phone, setPhone] = useState(lead.phone);

  useEffect(() => {
    setName(lead.name);
    setPhone(lead.phone);
  }, [lead.name, lead.phone]);

  const formatIndianNumber = (numStr: string): string => {
    let cleaned = numStr.toString().replace(/\D/g, "");
    if (cleaned.length === 10) return `+91${cleaned}`;
    if (cleaned.length === 11 && cleaned.startsWith("0")) return `+91${cleaned.substring(1)}`;
    if (cleaned.length === 12 && cleaned.startsWith("91")) return `+${cleaned}`;
    return "";
  };

  const handleSave = () => {
    const formatted = formatIndianNumber(phone);
    if (formatted) {
      onSave({ ...lead, name, phone: formatted, isInvalid: false });
      setIsEditing(false);
    } else {
      onSave({ ...lead, name, phone, isInvalid: true });
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <div className="flex gap-2 items-center bg-muted/50 p-2 rounded border border-border">
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-7 text-xs flex-1" placeholder="Name" />
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-7 text-xs flex-1" placeholder="Phone" />
        <Button size="icon" variant="ghost" className="h-6 w-6 text-green-500" onClick={handleSave}>
          <Check className="size-3" />
        </Button>
        <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500" onClick={() => setIsEditing(false)}>
          <X className="size-3" />
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("flex justify-between items-center text-xs border-b border-border pb-1 hover:bg-muted/30 p-1 -mx-1 px-1 rounded transition-colors group", (!lead.phone || !isValidPhoneNumber(String(lead.phone || ""))) && campaignStatus === "ready" && "bg-red-500/10 border-red-500/20")}>
      <div className="flex flex-col gap-0.5 overflow-hidden">
        <div className="flex items-center gap-2">
          {lead.isFailed ? (
            <X className="size-3.5 text-rose-500 shrink-0" />
          ) : lead.isCompleted ? (
            <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
          ) : lead.called ? (
            <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
          ) : (
            <Clock className="size-3 text-muted-foreground shrink-0 opacity-50" />
          )}
          <span className={cn("truncate max-w-[120px] font-medium", lead.called && "line-through text-muted-foreground", (!lead.phone || !isValidPhoneNumber(String(lead.phone || ""))) && campaignStatus === "ready" && "text-red-400 font-medium")}>{lead.name}</span>
        </div>
        {lead.didNumber && (
          <span className="text-[10px] text-muted-foreground ml-5 flex items-center gap-1">
            <PhoneOutgoing className="size-2.5 opacity-50" />
            {lead.didNumber} (Voice)
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className={cn("font-mono", lead.called && "line-through text-muted-foreground", (!lead.phone || !isValidPhoneNumber(String(lead.phone || ""))) && campaignStatus === "ready" && "text-red-400 font-medium")}>{lead.phone}</span>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-5 w-5 text-sky-400 hover:text-sky-300 hover:bg-sky-500/10" onClick={() => setIsEditing(true)}>
            <Pencil className="size-3" />
          </Button>
          {onDelete && (
            <Button size="icon" variant="ghost" className="h-5 w-5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(); }}>
              <Trash2 className="size-3" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}



export function CampaignCard({
  campaign,
  progressPercent,
  onUploadClick,
  onStart,
  onPause,
  onResume,
  onClear,
  onForceStop,
  onEditLead,
  onDeleteLead,
  onSchedule,
  onEditSchedule,
  onDeleteSchedule,
  displaySchedules,
  failedCallsCount = 0,
  disableSchedule,
  scheduleDisabledReason,
  hasOutboundNumber = true,
  className,
  companyId,
  callHistory = [],
}: CampaignCardProps) {
  const status = statusConfig[campaign.status] || { label: campaign.status || "Unknown", color: "text-muted-foreground", bgColor: "bg-muted" };
  const isComingSoon = campaign.comingSoon === true;
  const processedCount = campaign.completedCalls !== undefined 
    ? campaign.completedCalls 
    : (campaign.leads || []).filter((l: any) => l.called).length;

  const [reminding, setReminding] = useState(false);
  const [remindMessage, setRemindMessage] = useState<{text: string, type: 'success'|'error'} | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [isCheckingLock, setIsCheckingLock] = useState(() => !hasOutboundNumber && !(campaign.id === "camp-001" || campaign.isReactivation || campaign.name?.includes("Lead Reactivation")));
  const [activeTab, setActiveTab] = useState<"pending" | "successful" | "failed">("pending");
  const [expandedScheduleIdx, setExpandedScheduleIdx] = useState<number | null>(null);
  const [leadsModalOpen, setLeadsModalOpen] = useState(false);
  const isReactivationCard = campaign.id === "camp-001" || campaign.isReactivation || campaign.name?.includes("Lead Reactivation");
  const [historicalCampaigns, setHistoricalCampaigns] = useState<any[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem("cached_reactivation_campaigns");
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            // Clean up any stale or falsely cached "Completed" status on future waves running today
            const now = new Date();
            const istMinutes = (now.getUTCHours() * 60 + now.getUTCMinutes() + 330) % (24 * 60);
            const istDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

            return parsed.map((item: any) => {
              if (item.id) {
                const parts = item.id.split("-").map(Number);
                if (parts.length === 3) {
                  // Reactivation day is item.id (failed leads date) + 1 day
                  const reactDate = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + 1));
                  const reactDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(reactDate);

                  // Wave 3 runs overnight across midnight into the next day.
                  // Only seal Q3 if it was already Completed or if it is strictly more than 1 day past.
                  const diffDays = Math.round((new Date(istDateStr).getTime() - new Date(reactDateStr).getTime()) / (24 * 60 * 60 * 1000));
                  if (diffDays > 1 && item.q3?.status !== "Running") {
                    return {
                      ...item,
                      q1: { ...item.q1, status: "Completed" },
                      q2: { ...item.q2, status: "Completed" },
                      q3: { ...item.q3, status: "Completed" },
                      overallStatus: "Completed"
                    };
                  } else if (diffDays === 1) {
                    // Q1 and Q2 from yesterday are completed (cutoffs were 2:30 PM and 7:30 PM)
                    // But Q3 runs overnight until all leads contacted!
                    return {
                      ...item,
                      q1: { ...item.q1, status: "Completed" },
                      q2: { ...item.q2, status: "Completed" },
                    };
                  }

                  // If reactivation is scheduled for TODAY:
                  if (reactDateStr === istDateStr) {
                    // Q3 starts at 8:00 PM (1200 mins from midnight). Before 8:00 PM, Q3 cannot be completed unless all leads are completed
                    const q3Done = item.q3?.failedLeads && item.q3.failedLeads.length > 0 && item.q3.failedLeads.every((l: any) => l.isCompleted);
                    if (istMinutes < 1200 && !q3Done && item.q3?.status === "Completed") {
                      return {
                        ...item,
                        q3: { ...item.q3, status: "Pending" },
                        overallStatus: item.q1?.status === "Pending" ? "Pending Q1" : item.q2?.status === "Pending" ? "Pending Q2" : "Pending Q3"
                      };
                    }
                  }
                }
              }
              return item;
            });
          }
        }
      } catch (e) {}
    }
    return [];
  });
  const [selectedHistId, setSelectedHistId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem("cached_reactivation_campaigns");
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed[0].id;
        }
      } catch (e) {}
    }
    return null;
  });
  const [isHistoricalLoading, setIsHistoricalLoading] = useState(false);
  const [wavePages, setWavePages] = useState<Record<string, number>>({});
  const [isCalculating, setIsCalculating] = useState(false);
  const [isDoneChecking, setIsDoneChecking] = useState(false);
  const [reactivationSearchQuery, setReactivationSearchQuery] = useState("");
  const [allNumbersSearchQuery, setAllNumbersSearchQuery] = useState("");

  // ─── Nightly calculation window detection (11:45 PM – 00:05 AM IST) ───
  useEffect(() => {
    const checkCalculatingWindow = () => {
      const now = new Date();
      // IST = UTC+5:30
      const istMinutes = (now.getUTCHours() * 60 + now.getUTCMinutes() + 330) % (24 * 60);
      // 23:45 = 1425 min, 00:05 = 5 min (next day)
      const inWindow = istMinutes >= 1425 || istMinutes <= 5;
      setIsCalculating(inWindow);
      // After the window closes (00:05 → 00:08 IST), briefly show "Done Checking"
      const justDone = istMinutes >= 6 && istMinutes <= 8;
      setIsDoneChecking(justDone);
    };
    checkCalculatingWindow();
    const t = setInterval(checkCalculatingWindow, 15000); // check every 15s
    return () => clearInterval(t);
  }, []);


  useEffect(() => {
    if (isReactivationCard) {
      const fetchDashboard = () => {
        const token = localStorage.getItem("accessToken") || localStorage.getItem("access_token") || "";
        fetch(`/api/reactivation/dashboard?t=${Date.now()}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store"
        })
          .then(res => res.json())
          .then(res => {
            if (res.data) {
                setHistoricalCampaigns(res.data);
                try {
                  localStorage.setItem("cached_reactivation_campaigns", JSON.stringify(res.data));
                } catch (e) {}
                if (res.data.length > 0) {
                  // Select the first one automatically if none is selected
                  setSelectedHistId(prev => prev || res.data[0].id);
                }
                
                // Trigger animation for any wave that is completed but not yet shown
                const todayStr = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(new Date()).replace("Sept", "Sep");
                const todayStrAlt = todayStr.replace("Sep", "Sept");

                res.data.forEach((bucket: any) => {
                  ['q1', 'q2', 'q3'].forEach((qKey, idx) => {
                    const wave = bucket[qKey];
                    // We only want to trigger the animation if the wave completed *today* 
                    // (its scheduled string should contain today's date)
                    if (wave?.status === "Completed" && (wave.scheduled?.startsWith(todayStr) || wave.scheduled?.startsWith(todayStrAlt))) {
                      const shownKey = `reactivation_animation_shown_${bucket.id}_${qKey}`;
                      if (!localStorage.getItem(shownKey)) {
                        localStorage.setItem(shownKey, "true");
                        
                        const waveNum = idx + 1;
                        let title = `Wave ${waveNum} Completed`;
                        let subtitle = `Lead Reactivation Wave ${waveNum} finished.`;
                        if (waveNum === 3) {
                          title = "Lead Reactivation Completed";
                          subtitle = "All 3 waves finished.";
                        }
                        
                        // We add a tiny delay to ensure consecutive waves don't clash
                        setTimeout(() => {
                          window.dispatchEvent(new CustomEvent('triggerReactivationAnimation', {
                            detail: { title, subtitle, type: "reactivation" }
                          }));
                        }, idx * 2500); // staggering animations if multiple complete at once
                      }
                    }
                  });
                });
              }
            })
          .catch(err => console.error("Failed to fetch reactivation dashboard", err))
          .finally(() => setIsHistoricalLoading(false));
      };
      
      // Fetch dashboard without triggering loading state UI changes
      fetchDashboard();

      // Realtime polling:
      // - 2500ms when any wave is Running OR modal is open (real-time counters)
      // - 10000ms when all waves are idle/pending/completed
      const anyRunning = historicalCampaigns.some(
        (h: any) => h.q1?.status === "Running" || h.q2?.status === "Running" || h.q3?.status === "Running"
      );
      const pollMs = (leadsModalOpen || anyRunning) ? 2500 : 10000;
      const interval = setInterval(fetchDashboard, pollMs);
      return () => clearInterval(interval);
    }
  }, [isReactivationCard, leadsModalOpen, historicalCampaigns]);

  const todayStr = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(new Date()).replace("Sept", "Sep");
  const todayBucket = historicalCampaigns.find(h => h.date === todayStr || h.date === todayStr.replace("Sep", "Sept"));
  const todayLeadsCount = todayBucket ? (todayBucket.q1?.failedLeads?.length || 0) : 0;
  const totalReactivationLeads = todayLeadsCount;
  const totalFailedLeadsHistory = historicalCampaigns.reduce((acc, curr) => acc + (curr.q1?.failedLeads?.length || 0), 0);

  const runningWaveInfo = useMemo(() => {
    if (!isReactivationCard || !historicalCampaigns) return null;
    const LIVE_STATUSES = ["RINGING", "IN-PROGRESS", "DISPATCHING", "QUEUED_AT_PROVIDER", "ANSWERED"];
    for (const hist of historicalCampaigns) {
      if (hist.q3?.status === "Running") {
        const processed = (hist.q3.failedLeads || []).filter((l: any) => l.isCompleted || l.isFailed || l.isAttempted || l.isRinging || LIVE_STATUSES.includes((l.status || "").toUpperCase())).length;
        const total = hist.q3.failedLeads?.length || 0;
        return { stage: "Q3", date: hist.csvName, processed, total };
      }
      if (hist.q2?.status === "Running") {
        const processed = (hist.q2.failedLeads || []).filter((l: any) => l.isCompleted || l.isFailed || l.isAttempted || l.isRinging || LIVE_STATUSES.includes((l.status || "").toUpperCase())).length;
        const total = hist.q2.failedLeads?.length || 0;
        return { stage: "Q2", date: hist.csvName, processed, total };
      }
      if (hist.q1?.status === "Running") {
        const processed = (hist.q1.failedLeads || []).filter((l: any) => l.isCompleted || l.isFailed || l.isAttempted || l.isRinging || LIVE_STATUSES.includes((l.status || "").toUpperCase())).length;
        const total = hist.q1.failedLeads?.length || 0;
        return { stage: "Q1", date: hist.csvName, processed, total };
      }
    }
    return null;
  }, [isReactivationCard, historicalCampaigns]);

  const pendingLeads = (campaign.leads || []).map((l: any, i: number) => ({ ...l, originalIdx: i })).filter((l: any) => !l.called);
  const successLeads = (campaign.leads || []).map((l: any, i: number) => ({ ...l, originalIdx: i })).filter((l: any) => l.called && !l.isFailed);
  const failedLeads = (campaign.leads || []).map((l: any, i: number) => ({ ...l, originalIdx: i })).filter((l: any) => l.called && l.isFailed);
  const invalidLeads = (campaign.leads || []).map((l: any, i: number) => ({ ...l, originalIdx: i })).filter((l: any) => !l.phone || !isValidPhoneNumber(String(l.phone || "")));

  const filterFn = (l: any) => {
    if (!allNumbersSearchQuery) return true;
    const q = allNumbersSearchQuery.toLowerCase();
    const cleanQ = q.replace(/\D/g, '');
    const cleanPhone = (l.phone || '').replace(/\D/g, '');
    const phoneMatch = cleanQ && cleanPhone.includes(cleanQ);
    const nameMatch = (l.name || '').toLowerCase().includes(q);
    return phoneMatch || nameMatch;
  };

  const searchedPendingLeads = pendingLeads.filter(filterFn);
  const searchedSuccessLeads = successLeads.filter(filterFn);
  const searchedFailedLeads = failedLeads.filter(filterFn);
  
  useEffect(() => {
    if (allNumbersSearchQuery) {
      if (activeTab === "pending" && searchedPendingLeads.length === 0) {
        if (searchedSuccessLeads.length > 0) setActiveTab("successful");
        else if (searchedFailedLeads.length > 0) setActiveTab("failed");
      } else if (activeTab === "successful" && searchedSuccessLeads.length === 0) {
        if (searchedPendingLeads.length > 0) setActiveTab("pending");
        else if (searchedFailedLeads.length > 0) setActiveTab("failed");
      } else if (activeTab === "failed" && searchedFailedLeads.length === 0) {
        if (searchedPendingLeads.length > 0) setActiveTab("pending");
        else if (searchedSuccessLeads.length > 0) setActiveTab("successful");
      }
    }
  }, [allNumbersSearchQuery, activeTab, searchedPendingLeads.length, searchedSuccessLeads.length, searchedFailedLeads.length]);

  useEffect(() => {
    if (reactivationSearchQuery && historicalCampaigns.length > 0) {
      const q = reactivationSearchQuery.toLowerCase();
      const cleanQ = q.replace(/\D/g, '');
      
      const checkLead = (lead: any) => {
        const cleanPhone = (lead.phone || '').replace(/\D/g, '');
        const phoneMatch = cleanQ && cleanPhone.includes(cleanQ);
        const nameMatch = (lead.name || '').toLowerCase().includes(q);
        return phoneMatch || nameMatch;
      };

      const hasMatch = (hist: any) => {
        const q1Match = (hist.q1?.failedLeads || []).some(checkLead);
        const q2Match = (hist.q2?.failedLeads || []).some(checkLead);
        const q3Match = (hist.q3?.failedLeads || []).some(checkLead);
        return q1Match || q2Match || q3Match;
      };

      const activeHist = historicalCampaigns.find(h => h.id === selectedHistId);
      if (!activeHist || !hasMatch(activeHist)) {
        const foundHist = historicalCampaigns.find(hasMatch);
        if (foundHist && foundHist.id !== selectedHistId) {
          setSelectedHistId(foundHist.id);
          if (window.innerWidth < 768) {
            setTimeout(() => {
              document.getElementById("reactivation-details")?.scrollIntoView({ behavior: "smooth" });
            }, 50);
          }
        }
      }
    }
  }, [reactivationSearchQuery, historicalCampaigns, selectedHistId]);


  const pendingSchedules = (displaySchedules || []).filter((s: any) => new Date(s.scheduledAt).getTime() > Date.now());
  const isPendingSchedule = pendingSchedules.length > 0;



  useEffect(() => {
    if (isReactivationCard || hasOutboundNumber) {
      setIsCheckingLock(false);
      return;
    }

    const storedUserStr = localStorage.getItem("user");
    const user = storedUserStr ? JSON.parse(storedUserStr) : {};
    const email = user.email || user.id || "default";

    const adminBase = process.env.NEXT_PUBLIC_ADMIN_URL || "https://admin.propnexai.com";
    
    setIsCheckingLock(true);
    
    fetch(`${adminBase}/api/number-requests?email=${encodeURIComponent(email)}&type=OUTBOUND${companyId ? `&companyId=${companyId}` : ''}`)
      .then(res => res.json())
      .then(data => {
         if (data.locked) {
           setIsLocked(true);
           setRemindMessage({ text: "You can only request once every 24 hours.", type: "error" });
           const key = companyId ? `last_outbound_number_request_${companyId}` : "last_outbound_number_request";
           localStorage.setItem(key, Date.now().toString());
         } else {
           setIsLocked(false);
           setRemindMessage(null);
         }
      })
      .catch(err => {
         console.error("Failed to check lock", err);
         const key = companyId ? `last_outbound_number_request_${companyId}` : "last_outbound_number_request";
         const lastRequest = localStorage.getItem(key);
         if (lastRequest) {
           const hoursSince = (Date.now() - parseInt(lastRequest)) / (1000 * 60 * 60);
           if (hoursSince < 24) {
             setIsLocked(true);
             setRemindMessage({ text: "You can only request once every 24 hours.", type: "error" });
           }
         }
      })
      .finally(() => {
         setIsCheckingLock(false);
      });

  }, [companyId, hasOutboundNumber, isReactivationCard]);

  const handleRemindAdmin = async () => {
    try {
      setReminding(true);
      setRemindMessage(null);
      const token = localStorage.getItem("accessToken") || localStorage.getItem("access_token");
      const storedUserStr = localStorage.getItem("user");
      const user = storedUserStr ? JSON.parse(storedUserStr) : {};
      const email = user.email || user.id || "default";
      const key = companyId ? `last_outbound_number_request_${companyId}` : "last_outbound_number_request";

      const adminBase = process.env.NEXT_PUBLIC_ADMIN_URL || "https://admin.propnexai.com";
      const res = await fetch(`${adminBase}/api/number-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          companyId: companyId || user.companyId || null,
          name: `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Unknown",
          type: "OUTBOUND"
        })
      });

      if (res.ok) {
        setRemindMessage({ text: "Reminder sent successfully! Admin notified.", type: "success" });
        localStorage.setItem(key, Date.now().toString());
        setIsLocked(true);
      } else if (res.status === 429) {
        setRemindMessage({ text: "You can only request once every 24 hours.", type: "error" });
        localStorage.setItem(key, Date.now().toString());
        setIsLocked(true);
      } else {
        setRemindMessage({ text: "Failed to send reminder. Please try again.", type: "error" });
      }
    } catch (e) {
      setRemindMessage({ text: "Error sending reminder.", type: "error" });
    }
    setReminding(false);
  };

  if (isComingSoon) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "glass-card relative overflow-hidden rounded-lg border border-dashed border-border p-6",
          className
        )}
      >
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex size-9 items-center justify-center rounded-lg bg-muted">
                <PhoneOutgoing className="size-5 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold">{campaign.name}</h3>
              <Badge variant="secondary" className="gap-1">
                <Sparkles className="size-3" />
                Coming Soon
              </Badge>
            </div>

            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
              Failed outbound calls will be automatically moved here for you to reschedule and reactivate later.
            </p>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("glass-card rounded-2xl p-6", className)}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-lg bg-muted">
              <PhoneOutgoing className="size-5 text-foreground" />
            </div>
            <h3 className="text-lg font-semibold">{campaign.name}</h3>
            {isReactivationCard && isCalculating ? (
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold animate-pulse"
                style={{
                  background: "linear-gradient(90deg, rgba(251,191,36,0.25), rgba(245,158,11,0.35), rgba(251,191,36,0.25))",
                  backgroundSize: "200% 100%",
                  animation: "calcGlow 1.5s ease-in-out infinite, pulse 1.5s ease-in-out infinite",
                  border: "1px solid rgba(251,191,36,0.6)",
                  color: "#fbbf24",
                  boxShadow: "0 0 12px rgba(251,191,36,0.4), 0 0 24px rgba(251,191,36,0.2)",
                }}
              >
                <span className="inline-block animate-spin" style={{ animationDuration: "1s" }}>⟳</span>
                Calculating...
              </span>
            ) : isReactivationCard && isDoneChecking ? (
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold"
                style={{
                  background: "rgba(52,211,153,0.2)",
                  border: "1px solid rgba(52,211,153,0.5)",
                  color: "#34d399",
                  boxShadow: "0 0 10px rgba(52,211,153,0.3)",
                }}
              >
                ✓ Done Checking
              </span>
            ) : (
              <Badge variant="secondary">
                {isPendingSchedule && (campaign.status === "idle" || campaign.status === "scheduled")
                  ? `${pendingSchedules.length} Scheduled` 
                  : campaign.status !== "idle" && (pendingSchedules[0]?.csvName || campaign.uploadedFileName) && !campaign.isReactivation && campaign.id !== "camp-001" && !campaign.name?.includes("Lead Reactivation")
                    ? `${status.label} • ${campaign.uploadedFileName || pendingSchedules[0]?.csvName}`
                    : (isReactivationCard ? (() => {
                        if (isHistoricalLoading) return "Loading Leads...";
                        return `${todayStr} - ${totalReactivationLeads} Lead${totalReactivationLeads !== 1 ? 's' : ''}`;
                      })() : status.label)}
              </Badge>
            )}
            {isReactivationCard && runningWaveInfo ? (
               <div className="flex gap-2 ml-2">
                 <Badge 
                    variant="outline" 
                    className="text-xs font-semibold px-2.5 py-0.5 bg-blue-500/15 text-blue-500 border-blue-500/30 animate-pulse flex items-center gap-1.5"
                 >
                   <span className="relative flex size-2">
                     <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                     <span className="relative inline-flex rounded-full size-2 bg-blue-500" />
                   </span>
                   Running {runningWaveInfo.stage} - {runningWaveInfo.processed} / {runningWaveInfo.total}
                 </Badge>
               </div>
            ) : isReactivationCard && campaign.qStage && campaign.qStatus ? (
               <div className="flex gap-2 ml-2">
                 <Badge 
                    variant={campaign.qStatus === "Completed" ? "outline" : "default"} 
                    className={cn("text-xs font-semibold px-2 py-0.5", campaign.qStatus === "Running" && "animate-pulse")}
                 >
                   {campaign.qStage === "Q3" && campaign.qStatus === "Completed" 
                      ? "Completed" 
                      : `${campaign.qStatus} ${campaign.qStage}`}
                 </Badge>
               </div>
            ) : null}
            
            {(campaign.status !== "idle" && !isReactivationCard && campaign.leads && campaign.leads.length > 0) && (
              <div className="flex items-center gap-2 ml-2">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 text-xs px-3 rounded-full bg-muted/50 hover:bg-muted transition-colors border-border/50 gap-1.5 font-medium" title="View/Edit Leads">
                      <ListChecks className="size-3.5 text-muted-foreground" />
                      All Numbers
                    </Button>
                  </DialogTrigger>
                  <DialogContent 
                    onOpenAutoFocus={(e) => e.preventDefault()}
                    className="max-w-4xl w-[90vw] h-[80vh] flex flex-col overflow-hidden bg-background/95 backdrop-blur-xl border-primary/20 p-0 shadow-2xl z-50"
                  >
                    <DialogHeader className="p-6 pb-4 border-b border-border/50 bg-muted/10 shrink-0">
                      <div className="flex items-center justify-between gap-4">
                        <DialogTitle className="text-xl flex items-center gap-2 font-semibold">
                          <ListChecks className="size-5 text-primary" />
                          All Numbers of {campaign.uploadedFileName || (pendingSchedules[0]?.csvName) || "CSV"}
                        </DialogTitle>
                        <div className="relative mr-6">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                          <input
                            type="text"
                            placeholder="Search name or number..."
                            value={allNumbersSearchQuery}
                            onChange={(e) => setAllNumbersSearchQuery(e.target.value)}
                            className="h-9 w-48 md:w-64 rounded-md border border-input bg-background pl-9 pr-4 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                          />
                        </div>
                      </div>
                    </DialogHeader>
                    
                    <div className="flex-1 overflow-y-auto p-6">
                      {(campaign.status === "ready" || campaign.status === "scheduled") && (
                      <div className="space-y-2">
                        <p className="font-semibold text-sm text-muted-foreground">Pending ({(searchedPendingLeads || []).length} Leads)</p>
                        {(searchedPendingLeads || [])
                          .sort((a: any, b: any) => {
                            const aValid = a.phone && isValidPhoneNumber(String(a.phone || ""));
                            const bValid = b.phone && isValidPhoneNumber(String(b.phone || ""));
                            if (!aValid && bValid) return -1;
                            if (aValid && !bValid) return 1;
                            return 0;
                          })
                          .map((lead: any) => (
                            <LeadRow key={`${lead.phone}-${lead.originalIdx}`} lead={lead} idx={lead.originalIdx} onSave={(newLead) => onEditLead?.(lead.originalIdx, newLead)} onDelete={campaign.status === "ready" ? () => onDeleteLead?.(lead.originalIdx) : undefined} campaignStatus={campaign.status} />
                          ))}
                      </div>
                    )}

                    {campaign.status === "running" && (
                      <div className="space-y-4">
                        <div className="flex items-center gap-1 border-b border-border pb-2">
                          <button onClick={() => setActiveTab("pending")} className={cn("px-3 py-1 text-xs font-medium rounded-full transition-colors", activeTab === "pending" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50")}>
                            Pending ({searchedPendingLeads.length})
                          </button>
                          <button onClick={() => setActiveTab("successful")} className={cn("px-3 py-1 text-xs font-medium rounded-full transition-colors", activeTab === "successful" ? "bg-emerald-500/20 text-emerald-600" : "text-muted-foreground hover:bg-muted/50")}>
                            Success ({searchedSuccessLeads.length})
                          </button>
                          <button onClick={() => setActiveTab("failed")} className={cn("px-3 py-1 text-xs font-medium rounded-full transition-colors", activeTab === "failed" ? "bg-rose-500/20 text-rose-600" : "text-muted-foreground hover:bg-muted/50")}>
                            Failed ({searchedFailedLeads.length})
                          </button>
                        </div>
                        
                        {activeTab === "pending" && searchedPendingLeads.length > 0 && (
                          <div className="space-y-2">
                            {searchedPendingLeads.map((lead: any) => (
                              <LeadRow key={`${lead.phone}-${lead.originalIdx}`} lead={lead} idx={lead.originalIdx} onSave={() => {}} campaignStatus={campaign.status} />
                            ))}
                          </div>
                        )}
                        {activeTab === "pending" && searchedPendingLeads.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No pending leads found</p>}

                        {activeTab === "successful" && searchedSuccessLeads.length > 0 && (
                          <div className="space-y-2">
                            {searchedSuccessLeads.map((lead: any) => (
                              <LeadRow key={`${lead.phone}-${lead.originalIdx}`} lead={lead} idx={lead.originalIdx} onSave={() => {}} campaignStatus={campaign.status} />
                            ))}
                          </div>
                        )}
                        {activeTab === "successful" && searchedSuccessLeads.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No successful calls found</p>}

                        {activeTab === "failed" && searchedFailedLeads.length > 0 && (
                          <div className="space-y-2">
                            {searchedFailedLeads.map((lead: any) => (
                              <LeadRow key={`${lead.phone}-${lead.originalIdx}`} lead={lead} idx={lead.originalIdx} onSave={() => {}} campaignStatus={campaign.status} />
                            ))}
                          </div>
                        )}
                        {activeTab === "failed" && searchedFailedLeads.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No failed calls found</p>}
                      </div>
                    )}

                    </div>
                  </DialogContent>
                </Dialog>
                
                {campaign.status === "ready" && (campaign.leads || []).some((l: any) => !l.phone || !isValidPhoneNumber(String(l.phone || ""))) && (
                  <span className="text-xs font-medium text-red-500 bg-red-500/10 px-2 py-1 rounded-md flex items-center animate-in fade-in zoom-in-95 duration-200">
                    &larr; Please correct invalid numbers before starting
                  </span>
                )}
              </div>
            )}
          </div>

          {campaign.uploadedFileName && !campaign.isReactivation && campaign.id !== "camp-001" && !campaign.name?.includes("Lead Reactivation") && (
            <p className="text-sm text-muted-foreground">
              File: <span className="text-foreground">{campaign.uploadedFileName}</span>
              {" · "}
              <span className="text-foreground">{campaign.totalContacts}</span> contacts
            </p>
          )}

          {campaign.status === "ready" && invalidLeads.length > 0 && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg max-h-40 overflow-y-auto">
              <p className="text-sm font-semibold text-red-500 mb-2 flex items-center gap-2">
                <AlertCircle className="size-4" />
                Found {invalidLeads.length} invalid number(s). Please correct them before starting:
              </p>
              <div className="space-y-1">
                {invalidLeads.slice(0, 20).map((lead: any) => (
                  <LeadRow key={`invalid-${lead.originalIdx}`} lead={lead} idx={lead.originalIdx} onSave={(newLead) => onEditLead?.(lead.originalIdx, newLead)} onDelete={() => onDeleteLead?.(lead.originalIdx)} campaignStatus={campaign.status} />
                ))}
                {invalidLeads.length > 20 && (
                  <p className="text-xs text-red-500/70 text-center py-2">+{invalidLeads.length - 20} more invalid leads</p>
                )}
              </div>
            </div>
          )}

          {(campaign.status === "idle" || campaign.status === "completed" || isReactivationCard) && (
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">
                {isReactivationCard
                  ? `Automatically re-engage failed leads across 3 follow-up waves. (${totalReactivationLeads} total failed leads today)`
                  : !hasOutboundNumber 
                    ? "Please request an outbound number from the admin to launch campaigns." 
                    : "Upload a CSV contact list to prepare your next outbound campaign."}
              </p>
            </div>
          )}


          {/* Schedule badges — unified for local history and backend scheduled state */}
          {(() => {
            if (!displaySchedules || displaySchedules.length === 0) return null;

            return (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col gap-2 mt-2"
              >
                {displaySchedules.map((schedule: any, idx: number) => {
                  const isPending = new Date(schedule.scheduledAt).getTime() > Date.now();
                  const isExpanded = expandedScheduleIdx === idx;
                  
                  return (
                    <div 
                      key={idx} 
                      onClick={() => setExpandedScheduleIdx(isExpanded ? null : idx)}
                      className="flex flex-col gap-2 bg-muted/30 hover:bg-muted/50 border border-border rounded-lg px-3 py-2 text-xs w-full max-w-lg cursor-pointer transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <CalendarClock className="size-4 text-primary" />
                          <span className="font-medium">
                            {isPending ? (
                              <span className="text-amber-500">Pending</span>
                            ) : (campaign.status === "running" && idx === 0) ? (
                              <span className="text-emerald-500">Running {processedCount} / {campaign.totalContacts}</span>
                            ) : (campaign.status === "paused" && idx === 0) ? (
                              <span className="text-amber-500">
                                {campaign.pausedBy === 'campaign' 
                                  ? `Paused by Campaign (${processedCount} / ${campaign.totalContacts})` 
                                  : campaign.pausedBy === 'server'
                                    ? `Paused by Server (${processedCount} / ${campaign.totalContacts})`
                                    : `Paused ${processedCount} / ${campaign.totalContacts}`}
                              </span>
                            ) : (
                              <span className="text-emerald-500">Completed</span>
                            )}
                          </span>
                          <span className="text-muted-foreground">•</span>
                          <span className="text-muted-foreground">
                            {new Date(schedule.scheduledAt).toLocaleString(undefined, { weekday: "long", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <div className="text-muted-foreground flex items-center">
                          {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                        </div>
                      </div>
                      
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div 
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 mt-1 border-t border-border/50">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground pl-6">
                                  <span className="flex items-center gap-1">
                                    File Name <span className="font-medium text-foreground truncate max-w-[120px]" title={schedule.csvName}>{schedule.csvName || "Campaign Schedule"}</span>,
                                  </span>
                                  
                                  {schedule.did && (
                                    <span className="flex items-center gap-1">
                                      DID Num -
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <span className="font-mono text-foreground cursor-help hover:text-primary transition-colors border-b border-dashed border-muted-foreground/50 pb-0.5">
                                              ...{schedule.did.replace(/\D/g, '').slice(-3)}
                                            </span>
                                          </TooltipTrigger>
                                          <TooltipContent className="text-xs space-y-1">
                                            <p><span className="text-muted-foreground">Full Number:</span> {schedule.did.startsWith('+') ? schedule.did : `+91${schedule.did.replace(/^[0]+/, '')}`}</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>,
                                    </span>
                                  )}
                                  
                                  <span className="flex items-center gap-1">
                                    Channel - <span className="font-medium text-foreground">{schedule.channels || 1}</span>,
                                  </span>
                                  
                                  {/* Failed calls with Info Popover */}
                                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                    <span>Leads <span className="font-medium text-foreground">{schedule.leadsCount || (schedule.leads?.length || 0)}</span></span>
                                  {(schedule.leads && schedule.leads.length > 0) || (campaign.status === "running" && idx === 0 && (campaign.leads?.length ?? 0) > 0) ? (
                                    <Popover>
                                      <PopoverTrigger asChild>
                                        <div className={cn("flex size-5 cursor-pointer items-center justify-center rounded-full transition-colors", (campaign.status === "running" && idx === 0) ? "bg-primary animate-pulse shadow-[0_0_8px_rgba(var(--primary),0.8)]" : "bg-muted hover:bg-muted-foreground/20")} title="View Leads">
                                          <Info className={cn("size-3", (campaign.status === "running" && idx === 0) ? "text-primary-foreground" : "text-foreground")} />
                                        </div>
                                      </PopoverTrigger>
                                      <PopoverContent className="w-[350px] max-h-96 overflow-y-auto p-3 space-y-4 z-50">
                                        {campaign.status === "running" && idx === 0 ? (
                                          <div className="space-y-4">
                                            <div className="flex items-center gap-1 border-b border-border pb-2">
                                              <button onClick={() => setActiveTab("pending")} className={cn("px-3 py-1 text-xs font-medium rounded-full transition-colors", activeTab === "pending" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50")}>
                                                Pending ({pendingLeads.length})
                                              </button>
                                              <button onClick={() => setActiveTab("successful")} className={cn("px-3 py-1 text-xs font-medium rounded-full transition-colors", activeTab === "successful" ? "bg-emerald-500/20 text-emerald-600" : "text-muted-foreground hover:bg-muted/50")}>
                                                Success ({successLeads.length})
                                              </button>
                                              <button onClick={() => setActiveTab("failed")} className={cn("px-3 py-1 text-xs font-medium rounded-full transition-colors", activeTab === "failed" ? "bg-rose-500/20 text-rose-600" : "text-muted-foreground hover:bg-muted/50")}>
                                                Failed ({failedLeads.length})
                                              </button>
                                            </div>
                                            
                                            {activeTab === "pending" && pendingLeads.length > 0 && (
                                              <div className="space-y-2">
                                                {pendingLeads.slice(0, 50).map((lead: any) => (
                                                  <LeadRow key={`${lead.phone}-${lead.originalIdx}`} lead={lead} idx={lead.originalIdx} onSave={() => {}} campaignStatus={campaign.status} />
                                                ))}
                                                {pendingLeads.length > 50 && (
                                                  <p className="text-xs text-muted-foreground text-center py-2">+{pendingLeads.length - 50} more pending</p>
                                                )}
                                              </div>
                                            )}
                                            {activeTab === "pending" && pendingLeads.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No pending leads</p>}
                                            {activeTab === "successful" && successLeads.length > 0 && (
                                              <div className="space-y-2">
                                                {successLeads.map((lead: any) => (
                                                  <LeadRow key={`${lead.phone}-${lead.originalIdx}`} lead={lead} idx={lead.originalIdx} onSave={() => {}} campaignStatus={campaign.status} />
                                                ))}
                                              </div>
                                            )}
                                            {activeTab === "successful" && successLeads.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No successful calls yet</p>}
                                            {activeTab === "failed" && failedLeads.length > 0 && (
                                              <div className="space-y-2">
                                                {failedLeads.map((lead: any) => (
                                                  <LeadRow key={`${lead.phone}-${lead.originalIdx}`} lead={lead} idx={lead.originalIdx} onSave={() => {}} campaignStatus={campaign.status} />
                                                ))}
                                              </div>
                                            )}
                                            {activeTab === "failed" && failedLeads.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No failed calls yet</p>}
                                          </div>
                                        ) : (
                                          <>
                                            <p className="font-semibold text-sm">Leads</p>
                                            <div className="space-y-1">
                                              {schedule.leads?.map((lead: any, iIdx: number) => (
                                                <div key={iIdx} className="flex justify-between items-center text-xs border-b border-border pb-1 hover:bg-muted/30 p-1 -mx-1 px-1 rounded">
                                                  <span className="truncate max-w-[120px]">{lead.name}</span>
                                                  <span className="font-mono">{lead.phone}</span>
                                                </div>
                                              ))}
                                            </div>
                                          </>
                                        )}
                                      </PopoverContent>
                                    </Popover>
                                  ) : null}
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-1 self-end sm:self-auto" onClick={(e) => e.stopPropagation()}>
                                {(onEditSchedule || onSchedule) && isPending && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="size-7 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
                                          onClick={() => {
                                            if (onEditSchedule) onEditSchedule(idx);
                                            else if (onSchedule) onSchedule();
                                          }}
                                        >
                                          <Pencil className="size-3.5" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent><p>Edit schedule time</p></TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                                {onDeleteSchedule && !isPending && !(campaign.status === "running" && idx === 0) && (!isReactivationCard || (campaign.qStage === "Q3" && campaign.qStatus === "Completed")) && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="size-7 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-500"
                                          onClick={() => onDeleteSchedule(idx)}
                                        >
                                          <Trash2 className="size-3.5" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent><p>Remove from history</p></TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </motion.div>
            );
          })()}
        </div>

        <div className="flex flex-col gap-2 items-end">
          <div className="flex flex-wrap gap-2 items-center">
            {!hasOutboundNumber && !isReactivationCard ? (
              <Button onClick={handleRemindAdmin} disabled={reminding || isLocked || isCheckingLock} className="gap-2 bg-fuchsia-600 hover:bg-fuchsia-500 text-white">
                <PhoneOutgoing className="size-4" />
                {isCheckingLock ? "Checking..." : reminding ? "Sending..." : (isLocked ? "Request Sent" : "Request Outbound Number")}
              </Button>
            ) : (campaign.status === "idle" || campaign.status === "completed" || campaign.status === "failed" || campaign.status === "force_stopped") && !isReactivationCard ? (
              <div className="flex gap-2">
                {(campaign.status === "failed" || campaign.status === "completed" || campaign.status === "force_stopped") && onClear && !isReactivationCard && (
                  <Button variant="outline" className="gap-2 text-destructive border-destructive/20 hover:bg-destructive/10" onClick={onClear}>
                    <Trash2 className="size-4" />
                    Clear
                  </Button>
                )}
                <Button variant="outline" className="gap-2" onClick={onUploadClick}>
                  <Upload className="size-4" />
                  Upload CSV
                </Button>
              </div>
            ) : null}

          {campaign.status === "ready" && (
            <div className="flex flex-col gap-2 items-end">
              <div className="flex gap-2">
                {!isReactivationCard && (
                  <Button variant="outline" className="gap-2 text-destructive border-destructive/20 hover:bg-destructive/10" onClick={onClear}>
                    <Trash2 className="size-4" />
                    Clear File
                  </Button>
                )}
                <Button className="gap-2" onClick={onStart} disabled={(campaign.leads || []).some((l: any) => !l.phone || !isValidPhoneNumber(String(l.phone || "")))}>
                  <Play className="size-4" />
                  Start Campaign
                </Button>
              </div>
            </div>
          )}

          {campaign.status === "running" && !isReactivationCard && (
            <div className="flex gap-2">
              <Button variant="outline" className="gap-2 text-destructive border-destructive/20 hover:bg-destructive/10" onClick={onForceStop}>
                <StopCircle className="size-4" />
                Force Stop
              </Button>
              <Button variant="secondary" className="gap-2 relative overflow-hidden group min-w-40" onClick={onPause}>
                <div className="absolute inset-0 bg-primary/10 w-full rounded-md z-0" />
                <motion.div 
                  className="absolute inset-0 bg-primary/20 rounded-md z-0" 
                  style={{ width: `${progressPercent}%` }} 
                  layout 
                />
                <span className="relative z-10 flex items-center gap-2">
                  <Pause className="size-4 hidden group-hover:block" />
                  <span className="group-hover:hidden">Processing {processedCount} / {campaign.totalContacts}</span>
                  <span className="hidden group-hover:block">Pause</span>
                </span>
              </Button>
            </div>
          )}

          {campaign.status === "paused" && !isReactivationCard && (
            <div className="flex gap-2">
              <Button variant="outline" className="gap-2 text-destructive border-destructive/20 hover:bg-destructive/10" onClick={onForceStop}>
                <StopCircle className="size-4" />
                Force Stop
              </Button>
              <Button className="gap-2 relative overflow-hidden group min-w-40" onClick={onResume}>
                <div className="absolute inset-0 bg-primary/10 w-full rounded-md z-0" />
                <motion.div 
                  className="absolute inset-0 bg-primary/20 rounded-md z-0" 
                  style={{ width: `${progressPercent}%` }} 
                  layout 
                />
                <span className="relative z-10 flex items-center gap-2">
                  <Play className="size-4 hidden group-hover:block" />
                  <span className="group-hover:hidden">Paused {processedCount} / {campaign.totalContacts}</span>
                  <span className="hidden group-hover:block">Resume</span>
                </span>
              </Button>
            </div>
          )}

          {isReactivationCard && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="border-primary/50 text-primary hover:bg-primary/10 gap-2 h-9 text-sm"
                onClick={() => setLeadsModalOpen(true)}
              >
                <ListChecks className="size-4" />
                {`Lead Info (${historicalCampaigns.length})`}
              </Button>
            </div>
          )}
          </div>
          {remindMessage && !isReactivationCard && (
            <p className={`text-xs ${remindMessage.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
              {remindMessage.text}
            </p>
          )}
        </div>
      </div>

      {/* Lead Info Modal */}
      <Dialog open={leadsModalOpen} onOpenChange={setLeadsModalOpen}>
        {isReactivationCard ? (
          <DialogContent 
            onOpenAutoFocus={(e) => e.preventDefault()}
            className="max-w-6xl w-[95vw] h-[85vh] p-0 flex flex-col overflow-hidden bg-background/95 backdrop-blur-xl border-primary/20"
          >
            <DialogHeader className="p-6 pb-4 border-b border-border/50 bg-muted/20 shrink-0">
              <DialogTitle className="flex items-center gap-2 text-xl">
                <ListChecks className="size-6 text-primary" />
                Lead Reactivation Dashboard
              </DialogTitle>
              <p className="text-sm text-muted-foreground">Manage and track failed leads across all historical outbound campaigns in Q1, Q2, and Q3 retry stages.</p>
            </DialogHeader>

            <div className="flex-1 flex flex-col md:flex-row overflow-y-auto md:overflow-hidden">
              {/* Left Panel: Campaigns List */}
              <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-border/50 flex flex-col bg-muted/10 shrink-0">
                <div className="p-4 text-xs font-semibold text-muted-foreground tracking-wider uppercase border-b border-border/50">Historical Campaigns</div>
                <div className="flex-none max-h-[40vh] md:max-h-none md:flex-1 overflow-y-auto p-3 space-y-2">
                  {historicalCampaigns.length === 0 && <div className="text-sm text-muted-foreground p-4 text-center">No failed leads found today.</div>}
                  {historicalCampaigns.map(hist => {
                    const isSelected = selectedHistId === hist.id;
                    const totalFailed = (hist.q1.failedLeads?.length || 0);
                    return (
                      <div 
                        key={hist.id}
                        onClick={() => {
                          setSelectedHistId(hist.id);
                          if (window.innerWidth < 768) {
                            setTimeout(() => {
                              document.getElementById("reactivation-details")?.scrollIntoView({ behavior: "smooth" });
                            }, 50);
                          }
                        }}
                        className={cn(
                          "p-3 rounded-xl cursor-pointer transition-all border text-sm flex flex-col gap-1.5",
                          isSelected 
                            ? "bg-primary/10 border-primary/40 shadow-[0_0_15px_rgba(var(--primary),0.15)]" 
                            : "bg-background border-border hover:border-primary/30 hover:bg-muted/50"
                        )}
                      >
                        <div className="flex flex-col gap-1 items-start w-full">
                          {(() => {
                            const LIVE_STATUSES = ["RINGING", "IN-PROGRESS", "DISPATCHING", "QUEUED_AT_PROVIDER", "ANSWERED"];
                            const getProcessedCount = (wave: any) => {
                              if (!wave?.failedLeads) return 0;
                              return wave.failedLeads.filter((l: any) => {
                                if (l.isCompleted || l.isFailed || l.isAttempted) return true;
                                const s = (l.status || "").toUpperCase();
                                return !!l.isRinging || LIVE_STATUSES.includes(s);
                              }).length;
                            };
                            const getTotalCount = (wave: any) => wave?.failedLeads?.length || 0;

                            // Prioritize Running wave first so live progress counter (X / total) is prominently shown!
                            const statusText = hist.q3?.status === "Running"
                              ? `Running - ${getProcessedCount(hist.q3)} / ${getTotalCount(hist.q3)} Q3`
                              : hist.q2?.status === "Running"
                              ? `Running - ${getProcessedCount(hist.q2)} / ${getTotalCount(hist.q2)} Q2`
                              : hist.q1?.status === "Running"
                              ? `Running - ${getProcessedCount(hist.q1)} / ${getTotalCount(hist.q1)} Q1`
                              : hist.q3?.status === "Completed" 
                              ? "Completed" 
                              : hist.q1?.status === "Pending" || hist.q1?.status === "Scheduled" ? `${hist.q1.status} Q1` 
                              : hist.q2?.status === "Pending" || hist.q2?.status === "Scheduled" ? `${hist.q2.status} Q2` 
                              : `${hist.q3?.status || "Pending"} Q3`;
                              
                            const isCompleted = statusText === "Completed";
                            
                            const didStats = hist.q1?.failedLeads?.reduce((acc: any, lead: any) => {
                              const did = lead.didNumber && lead.didNumber !== "Unknown" ? lead.didNumber : "Unknown";
                              if (!acc[did]) acc[did] = { count: 0, channels: lead.channels || 1 };
                              acc[did].count += 1;
                              return acc;
                            }, {}) || {};
                            const didKeys = Object.keys(didStats);

                            return (
                              <>
                                <div className="flex items-center gap-2 w-full justify-between">
                                  <div className="font-semibold truncate text-foreground" title={hist.csvName}>{hist.csvName}</div>
                                  {didKeys.length > 0 && (
                                    <Popover>
                                      <PopoverTrigger asChild>
                                        <div className="cursor-pointer relative flex items-center justify-center shrink-0 group" onClick={(e) => e.stopPropagation()}>
                                          {!isCompleted && <span className="absolute inline-flex h-full w-full rounded-full bg-primary/30 opacity-75 animate-ping duration-[3000ms]"></span>}
                                          <div className={cn(
                                            "relative flex items-center justify-center p-1.5 rounded-full transition-all group-hover:scale-105",
                                            isCompleted 
                                              ? "bg-muted/50 hover:bg-muted" 
                                              : "bg-primary/10 border border-primary/30 group-hover:bg-primary/20 shadow-[0_0_10px_rgba(var(--primary),0.15)]"
                                          )}>
                                            <PhoneOutgoing className={cn("size-3.5", isCompleted ? "text-muted-foreground" : "text-primary drop-shadow-md animate-pulse")} />
                                          </div>
                                        </div>
                                      </PopoverTrigger>
                                      <PopoverContent side="right" className="text-xs space-y-2 p-3 bg-card border-border/50 w-auto" onClick={(e) => e.stopPropagation()}>
                                        <div className="font-semibold border-b border-border/50 pb-1.5 mb-1.5 text-foreground">DID Usage Breakdown</div>
                                        {didKeys.map((did) => (
                                          <div key={did} className="flex flex-col text-muted-foreground gap-0.5">
                                            <span className="font-medium">DID Number - {did} <span className="opacity-50 mx-1">|</span> Ch - {didStats[did].channels}</span>
                                          </div>
                                        ))}
                                      </PopoverContent>
                                    </Popover>
                                  )}
                                </div>
                                <Badge 
                                  variant="outline" 
                                  className={cn("text-xs px-2.5 py-1 mt-0.5 font-medium border", 
                                    isCompleted && "bg-emerald-500/15 text-emerald-500 border-emerald-500/30", 
                                    statusText.includes("Running") && "bg-blue-500/15 text-blue-500 border-blue-500/30 animate-pulse",
                                    statusText.includes("Pending") && "bg-amber-500/15 text-amber-500 border-amber-500/30"
                                  )}
                                >
                                  {statusText}
                                </Badge>
                              </>
                            );
                          })()}
                        </div>
                        <div className="flex items-center justify-between mt-0.5">
                          <div className="text-xs font-medium text-red-400 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                            Total Failed Calls - {totalFailed} (Campaign - {hist.q1.failedLeads?.filter((l: any) => l.originalCallType === "Campaign").length || 0} , Lead - {hist.q1.failedLeads?.filter((l: any) => l.originalCallType === "Lead").length || 0} , Internal - {totalFailed - (hist.q1.failedLeads?.filter((l: any) => l.originalCallType === "Campaign" || l.originalCallType === "Lead").length || 0)})
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Panel: Q1, Q2, Q3 Tracking */}
              <div id="reactivation-details" className="flex-1 bg-background/50 flex flex-col min-w-0 overflow-visible md:overflow-hidden">
                <div className="p-4 border-b border-border/50 shrink-0 flex items-center justify-between">
                  <div className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">
                    Reactivation Lifecycle (3 Waves)
                  </div>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search name or number..."
                      value={reactivationSearchQuery}
                      onChange={(e) => setReactivationSearchQuery(e.target.value)}
                      className="h-8 w-48 md:w-64 rounded-md border border-input bg-background pl-8 pr-3 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                    />
                  </div>
                </div>
                
                {(() => {
                  const activeHist = historicalCampaigns.find(c => c.id === selectedHistId);
                  if (!activeHist) return <div className="flex-1 flex items-center justify-center text-muted-foreground p-8">Select a campaign to view details</div>;

                  return (
                    <div className="flex-1 md:overflow-auto p-4 md:p-6 pb-12 md:pb-6">
                      <div className="flex flex-col md:flex-row gap-4 md:gap-6 h-auto md:h-full">
                        {[
                          { stage: "Q1", label: activeHist.q1?.label || "Wave 1", data: activeHist.q1 },
                          { stage: "Q2", label: activeHist.q2?.label || "Wave 2", data: activeHist.q2 },
                          { stage: "Q3", label: activeHist.q3?.label || "Wave 3", data: activeHist.q3 }
                        ].map((wave, idx) => {
                          const LIVE_CALLING_STATUSES = ["RINGING", "IN-PROGRESS", "DISPATCHING", "QUEUED_AT_PROVIDER", "ANSWERED"];
                          const isLeadRinging = (lead: any) => {
                            if (lead.isCompleted) return false;
                            const s = (lead.status || "").toUpperCase();
                            return !!lead.isRinging || LIVE_CALLING_STATUSES.includes(s);
                          };

                          const allWaveLeads = wave.data?.failedLeads || [];

                          // Ringing leads matching search (or all ringing leads if no search)
                          const ringingLeads = allWaveLeads.filter((lead: any) => {
                            if (!isLeadRinging(lead)) return false;
                            if (!reactivationSearchQuery) return true;
                            const q = reactivationSearchQuery.toLowerCase();
                            const cleanQ = q.replace(/\D/g, '');
                            const cleanPhone = (lead.phone || '').replace(/\D/g, '');
                            return (cleanQ && cleanPhone.includes(cleanQ)) || (lead.name || '').toLowerCase().includes(q);
                          });

                          // Non-ringing leads matching search
                          const filteredLeads = allWaveLeads.filter((lead: any) => {
                            if (isLeadRinging(lead)) return false;
                            if (!reactivationSearchQuery) return true;
                            const q = reactivationSearchQuery.toLowerCase();
                            const cleanQ = q.replace(/\D/g, '');
                            const cleanPhone = (lead.phone || '').replace(/\D/g, '');
                            return (cleanQ && cleanPhone.includes(cleanQ)) || (lead.name || '').toLowerCase().includes(q);
                          });

                          // STRICT USER REQUIREMENT SORTING:
                          // 1st: Ringing/live leads (handled above as ringingLeads, pinned at very top)
                          // 2nd: Success (Completed) leads
                          // 3rd: Failed leads
                          // 4th: Pending leads
                          const getLeadScore = (lead: any, waveStatus: string) => {
                            if (lead.isCompleted) return 3;  // 2nd
                            const isFailed = lead.isFailed || (waveStatus === "Completed" && !lead.isCompleted);
                            if (isFailed) return 2;          // 3rd
                            return 1;                        // 4th Pending
                          };

                          const sortedLeads = [...filteredLeads].sort((a: any, b: any) => getLeadScore(b, wave.data.status) - getLeadScore(a, wave.data.status));
                          const nonRingingLeads = sortedLeads; // ringing already excluded above

                          const currentPage = wavePages[`${activeHist.id}-${wave.stage}`] || 1;
                          const itemsPerPage = 10;
                          const totalPages = Math.max(1, Math.ceil(nonRingingLeads.length / itemsPerPage));
                          const paginatedLeads = nonRingingLeads.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
                          const setWavePage = (page: number) => setWavePages(prev => ({ ...prev, [`${activeHist.id}-${wave.stage}`]: page }));

                          const processedCount = allWaveLeads.filter((l: any) => l.isCompleted || l.isFailed || isLeadRinging(l) || l.isAttempted).length;
                          const totalCount = allWaveLeads.length;
                          
                          return (
                          <div key={wave.stage} className="flex-1 flex flex-col border border-border/60 rounded-2xl bg-card overflow-hidden shadow-sm relative min-h-[300px] md:min-h-0">
                            {/* Wave Header */}
                            <div className="p-4 border-b border-border/50 bg-muted/20 flex flex-col gap-3 shrink-0">
                              <div className="flex items-center justify-between">
                                <div className="flex flex-col">
                                  <span className="font-bold text-foreground">{wave.label} ({wave.stage})</span>
                                  <span className="text-xs text-muted-foreground">{wave.data.scheduled}</span>
                                </div>
                                <Badge 
                                  variant="outline"
                                  className={cn(
                                    "px-2.5 py-1 text-xs font-medium border",
                                    wave.data.status === "Running" && "bg-blue-500/15 text-blue-500 border-blue-500/30 animate-pulse",
                                    wave.data.status === "Completed" && "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
                                    wave.data.status === "Pending" && "bg-amber-500/15 text-amber-500 border-amber-500/30"
                                  )}
                                >
                                  {wave.data.status === "Running" 
                                    ? `Running - ${processedCount} / ${totalCount}` 
                                    : wave.data.status}
                                </Badge>
                              </div>
                              {(() => {
                                const isPendingWave = wave.data.status === "Pending" || wave.data.status === "Scheduled";
                                const isCompletedWave = wave.data.status === "Completed";
                                const leadsToCount = reactivationSearchQuery ? [...ringingLeads, ...filteredLeads] : allWaveLeads;
                                const total = leadsToCount.length;
                                const succeeded = leadsToCount.filter((l: any) => l.isCompleted).length;
                                const failed = isCompletedWave
                                  ? Math.max(0, total - succeeded)
                                  : leadsToCount.filter((l: any) => l.isFailed && !l.isCompleted).length;
                                const ringingNow = leadsToCount.filter((l: any) => isLeadRinging(l)).length;
                                const pending = Math.max(0, total - succeeded - failed - ringingNow);

                                if (isPendingWave) {
                                  if (total === 0) {
                                    return (
                                      <div className="flex items-center gap-1.5 text-xs text-amber-500 font-medium">
                                        <Clock className="size-3.5" />
                                        <span>
                                          {wave.stage === "Q2"
                                            ? "Calculates after 2:30 PM cutoff"
                                            : wave.stage === "Q3"
                                            ? "Calculates after 7:30 PM cutoff"
                                            : "Pending"}
                                        </span>
                                      </div>
                                    );
                                  }
                                  return (
                                    <div className="flex items-center gap-3 text-xs font-medium flex-wrap">
                                      <span className="flex items-center gap-1.5">
                                        <span className="text-muted-foreground">Total Leads</span>
                                        <span className="bg-muted text-foreground px-2.5 py-0.5 rounded-full font-bold">{total}</span>
                                      </span>
                                      <span className="flex items-center gap-1.5">
                                        <span className="text-amber-500">Pending</span>
                                        <span className="bg-amber-500/15 text-amber-500 px-2.5 py-0.5 rounded-full font-bold">{pending > 0 ? pending : total}</span>
                                      </span>
                                    </div>
                                  );
                                }

                                return (
                                  <div className="flex items-center justify-between gap-1.5 text-xs font-medium flex-wrap">
                                    <span className="flex items-center gap-1">
                                      <span className="text-muted-foreground">Total Leads</span>
                                      <span className="bg-muted text-foreground px-2 py-0.5 rounded-full font-bold">{total}</span>
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <span className="text-emerald-500">Success</span>
                                      <span className="bg-emerald-500/15 text-emerald-500 px-2 py-0.5 rounded-full font-bold">{succeeded}</span>
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <span className="text-red-500">Failed</span>
                                      <span className="bg-red-500/15 text-red-500 px-2 py-0.5 rounded-full font-bold">{failed}</span>
                                    </span>
                                    {/* Hide Pending pill when wave is Running — only show Success/Failed realtime */}
                                    {wave.data.status !== "Running" && pending > 0 && (
                                      <span className="flex items-center gap-1">
                                        <span className="text-amber-500">Pending</span>
                                        <span className="bg-amber-500/15 text-amber-500 px-2 py-0.5 rounded-full font-bold">{pending}</span>
                                      </span>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                            
                            {/* Wave Leads List */}
                            <div className="flex-1 overflow-y-auto p-2">
                              {ringingLeads.length === 0 && paginatedLeads.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-6 text-center">
                                  <ListChecks className="size-8 mb-2 opacity-30 text-amber-500/70" />
                                  <span className="text-sm font-semibold text-foreground/80">
                                    {wave.stage === "Q2" && (wave.data.status === "Pending" || wave.data.status === "Scheduled")
                                      ? "Calculates after 2:30 PM cutoff"
                                      : wave.stage === "Q3" && (wave.data.status === "Pending" || wave.data.status === "Scheduled")
                                      ? "Calculates after 7:30 PM cutoff"
                                      : "No leads found."}
                                  </span>
                                  {(wave.stage === "Q2" || wave.stage === "Q3") && (wave.data.status === "Pending" || wave.data.status === "Scheduled") && (
                                    <span className="text-xs text-muted-foreground/80 mt-1 max-w-xs">
                                      Non-completed leads from previous wave will roll over here.
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <div className="space-y-1.5 pb-2">
                                  {/* ── Ringing / Calling Now Leads (Always Pinned at Very Top) ── */}
                                  {ringingLeads.map((lead: any, rIdx: number) => (
                                    <div 
                                      key={`ringing-${rIdx}`} 
                                      className="flex flex-col gap-2 text-xs border-2 border-sky-400/90 bg-gradient-to-b from-sky-950/50 via-sky-900/30 to-sky-950/40 p-3 rounded-xl shadow-[0_0_25px_rgba(56,189,248,0.35)] ring-1 ring-sky-400/50 relative overflow-hidden mb-2.5 transition-all"
                                    >
                                      {/* Top animated accent bar */}
                                      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-sky-400 via-emerald-400 to-sky-400 animate-pulse" />

                                      {/* Header: Title + Live Badge */}
                                      <div className="flex items-center justify-between w-full">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                          <span className="relative flex size-2 shrink-0">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" />
                                            <span className="relative inline-flex rounded-full size-2 bg-sky-500" />
                                          </span>
                                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-sky-300 truncate">
                                            Ringing Now
                                          </span>
                                        </div>

                                        <div className="flex items-center gap-1.5 shrink-0">
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-sky-500/25 text-sky-200 border border-sky-400/50 shadow-sm animate-pulse">
                                            <span className="size-1.5 rounded-full bg-emerald-400 inline-block animate-ping" />
                                            LIVE CALL
                                          </span>
                                        </div>
                                      </div>

                                      {/* Phone Number Display */}
                                      <div className="flex items-center justify-between gap-2 py-0.5">
                                        <span className="font-mono font-black text-[15px] text-white tracking-wide whitespace-nowrap drop-shadow-md">
                                          {lead.phone}
                                        </span>
                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-500/30 text-sky-200 border border-sky-400/30 shrink-0">
                                          Ch {lead.channels || activeHist.channels || 1}
                                        </span>
                                      </div>

                                      {/* Metadata box */}
                                      <div className="flex flex-col gap-1 w-full text-[11px] font-medium py-1.5 px-2.5 rounded-lg border border-sky-500/30 bg-sky-500/15 text-sky-100/90 shadow-inner">
                                        <div className="flex items-center justify-between gap-1">
                                          <span className="text-muted-foreground/80 text-[10px] uppercase font-semibold">Contact:</span>
                                          <span className="font-semibold text-white truncate text-right max-w-[150px]">
                                            {lead.name || "Unknown"}
                                          </span>
                                        </div>
                                        <div className="flex items-center justify-between gap-1 pt-1 border-t border-sky-500/20 text-[10px]">
                                          <span className="text-muted-foreground/80 uppercase font-semibold">Assigned DID:</span>
                                          <span className="font-mono font-bold text-sky-300">
                                            {lead.didNumber !== "Unknown" ? lead.didNumber : (activeHist.didNumber || "Unknown")}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  ))}

                                  {/* ── Paginated Other Leads ── */}
                                  {paginatedLeads.map((lead: any, i: number) => {
                                    const isFailed = lead.isFailed || (wave.data.status === "Completed" && !lead.isCompleted);
                                    const isRinging = isLeadRinging(lead);
                                    return (
                                    <div 
                                      key={i} 
                                      className={cn(
                                        "flex flex-col gap-1.5 text-xs border pb-2.5 pt-2 px-3 rounded-xl shadow-sm transition-colors",
                                        isRinging 
                                          ? "border-sky-500/60 bg-sky-500/10 shadow-[0_0_15px_rgba(56,189,248,0.25)] ring-1 ring-sky-500/40" 
                                          : lead.isCompleted 
                                          ? "border-emerald-500/30 bg-emerald-500/5" 
                                          : isFailed 
                                          ? "border-red-500/30 bg-red-500/5" 
                                          : "border-border/30 bg-background/50 hover:bg-muted/30"
                                      )}
                                    >
                                      <div className="flex items-start justify-between w-full gap-2">
                                        <div className="flex items-start gap-2 flex-1 min-w-0">
                                          <div className="mt-0.5 shrink-0">
                                            {isRinging ? (
                                              <PhoneOutgoing className="size-4 text-sky-400 animate-bounce" />
                                            ) : lead.isCompleted ? (
                                              <CheckCircle2 className="size-4 text-emerald-500" />
                                            ) : isFailed ? (
                                              <X className="size-4 text-red-500" />
                                            ) : (
                                              <Clock className="size-4 text-muted-foreground opacity-50" />
                                            )}
                                          </div>
                                          <div className="flex flex-col gap-0.5 min-w-0">
                                            <div className="flex items-center gap-1.5">
                                              <span className={cn(
                                                "text-[10px] uppercase tracking-wider",
                                                isRinging ? "font-bold text-sky-400" : "font-semibold text-muted-foreground opacity-80"
                                              )}>
                                                LEAD {(currentPage - 1) * itemsPerPage + i + 1}
                                                {(wave.stage === "Q1" || wave.data.status === "Running" || wave.data.status === "Completed") && lead.originalCallType ? ` (${lead.originalCallType})` : ""}
                                              </span>
                                              {isRinging && (
                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30 animate-pulse">
                                                  CALLING NOW
                                                </span>
                                              )}
                                            </div>
                                            <span className={cn(
                                              "font-mono font-bold text-[13px] tracking-wide whitespace-nowrap",
                                              isRinging ? "text-sky-300 font-extrabold" : lead.isCompleted ? "text-emerald-600 dark:text-emerald-400" : isFailed ? "text-red-600 dark:text-red-400" : "text-foreground"
                                            )}>
                                              {lead.phone}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                      <div className={cn(
                                        "flex flex-col gap-0.5 w-full mt-1 text-[11px] font-medium py-1.5 px-2.5 rounded-lg border",
                                        isRinging 
                                          ? "bg-sky-500/20 border-sky-500/40 text-sky-200 shadow-sm font-semibold" 
                                          : lead.isCompleted 
                                          ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400" 
                                          : isFailed 
                                          ? "bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-400" 
                                          : "bg-muted/40 border-border/40 text-muted-foreground"
                                      )}>
                                        <div className="flex items-center justify-between gap-1">
                                          <span className="text-[10px] opacity-75">Name:</span>
                                          <span className="truncate max-w-[160px] text-right font-medium">{lead.name || "Unknown"}</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-1 pt-0.5 border-t border-border/30 text-[10px]">
                                          <span className="opacity-75">DID: {lead.didNumber !== "Unknown" ? lead.didNumber : (activeHist.didNumber || "Unknown")}</span>
                                          <span className="font-semibold">Ch {lead.channels || activeHist.channels || 1}</span>
                                        </div>
                                      </div>
                                    </div>
                                  )})}
                                </div>
                              )}
                            </div>
                            
                            {/* Pagination Controls */}
                            {totalPages > 1 && (
                              <div className="p-3 border-t border-border/50 bg-muted/10 shrink-0">
                                <div className="flex items-center justify-between">
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    className="h-7 text-xs px-2"
                                    onClick={() => setWavePage(Math.max(1, currentPage - 1))}
                                    disabled={currentPage === 1}
                                  >
                                    Previous
                                  </Button>
                                  <span className="text-xs text-muted-foreground">
                                    Page {currentPage} of {totalPages}
                                  </span>
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    className="h-7 text-xs px-2"
                                    onClick={() => setWavePage(Math.min(totalPages, currentPage + 1))}
                                    disabled={currentPage === totalPages}
                                  >
                                    Next
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </DialogContent>
        ) : (
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ListChecks className="size-5 text-primary" />
                {campaign.qStage
                  ? `Lead Reactivation ${campaign.qStage} — Leads (${campaign.leads?.length || 0})`
                  : `${campaign.name} — Call History (${callHistory.length})`}
              </DialogTitle>
            </DialogHeader>

            {!campaign.qStage ? (
              // Show call history
              <div className="max-h-96 overflow-y-auto space-y-1 pr-1">
                {callHistory.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No history.</p>
                ) : (
                  callHistory.map((call: any, i: number) => (
                    <div key={call.id || i} className="flex items-center justify-between text-xs border-b border-border pb-2 last:border-0 py-2 hover:bg-muted/30 px-2 rounded gap-2">
                      <div className="flex flex-col min-w-0">
                        <span className="font-medium text-foreground truncate">{call.contactName || call.name || "Unknown"}</span>
                        <span className="text-muted-foreground font-mono">{call.customerNumber || call.toNumber || call.phone || "—"}</span>
                      </div>
                      <div className="flex flex-col items-end gap-0.5 shrink-0">
                        <span className={cn(
                          "font-medium capitalize",
                          call.status === "completed" ? "text-emerald-500" :
                          call.status === "failed" || call.status === "busy" || call.status === "no-answer" ? "text-red-400" :
                          "text-muted-foreground"
                        )}>{call.status || "—"}</span>
                        <span className="text-muted-foreground">
                          {(call.callDateTime || call.createdAt) ? new Date(call.callDateTime || call.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ""}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              // Show leads list for active qStage
              <>
                <div className="max-h-80 overflow-y-auto space-y-1 pr-1">
                  {(campaign.leads || []).length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No leads available.</p>
                  ) : (
                    (campaign.leads || []).map((lead: any, i: number) => (
                      <div key={i} className="flex justify-between items-center text-xs border-b border-border pb-1.5 last:border-0 py-1.5 hover:bg-muted/30 px-1 rounded">
                        <span className={cn("truncate max-w-[150px] font-medium", lead.isFailed && "text-red-400")}>{lead.name || "—"}</span>
                        <span className={cn("font-mono text-muted-foreground", lead.isFailed && "text-red-400")}>{lead.phone}</span>
                      </div>
                    ))
                  )}
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  {campaign.scheduledAt
                    ? `Scheduled for ${new Date(campaign.scheduledAt).toLocaleString(undefined, { weekday: 'long', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                    : `Status: ${campaign.status}`}
                </p>
              </>
            )}
          </DialogContent>
        )}
      </Dialog>

    </motion.div>
  );
}
