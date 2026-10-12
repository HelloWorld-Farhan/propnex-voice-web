"use client";

import { useMemo, useState, useEffect } from "react";
import { PhoneIncoming, PhoneOutgoing, Upload, AlertCircle, CheckCircle2, Phone } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { TranscriptDrawer } from "@/components/common/transcript-drawer";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { CallLogFiltersBar } from "@/components/forms/call-log-filters";
import { CallLogTable } from "@/components/tables/call-log-table";
import { TablePagination } from "@/components/tables/table-pagination";
import { useInboundCallsApi, INBOUND_API_PAGE_SIZE } from "@/features/inbound/hooks/use-inbound-calls-api";
import { UploadCsvModal } from "@/features/outbound/components/upload-csv-modal";
import { CampaignCard } from "@/features/outbound/components/campaign-card";
import { useCampaign } from "@/features/outbound/hooks/use-campaign";
import { leadReactivationCampaign } from "@/features/outbound/data";
import { TransferCreditsModal } from "@/features/employees/components/transfer-credits-modal";
import {
  DEFAULT_CALL_FILTERS,
  type CallLogFilters,
  type CallRecord,
} from "@/types/call";
import { CompletionAnimation } from "@/components/ui/completion-animation";

type CompanyCallsSectionProps = {
  companyId: string;
  direction: "inbound" | "outbound";
};

// ─── Live call elapsed timer ─────────────────────────────────────────────────
function LiveCallTimer({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = new Date(startedAt).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  return <span className="font-mono font-semibold">{m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${String(s).padStart(2, "0")}s`}</span>;
}

// ─── Active / Ringing call banner ────────────────────────────────────────────
function ActiveCallBanner({ calls }: { calls: CallRecord[] }) {
  const seenLive = new Set<string>();
  const liveCalls = calls.filter((c) => {
    if (c.status !== "ringing" && c.status !== "answered") return false;
    const custCore = c.customerNumber.replace(/\D/g, "").slice(-10);
    const didCore = c.assignedNumber.replace(/\D/g, "").slice(-10);
    const key = `${custCore}_${didCore}`;
    if (seenLive.has(key)) return false;
    seenLive.add(key);
    return true;
  });
  if (liveCalls.length === 0) return null;
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3"
      >
        {liveCalls.map((call) => (
          <div key={call.id} className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5">
              <span className="relative flex size-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full size-3 bg-emerald-500" />
              </span>
              <Phone className="size-4 text-emerald-400" />
              <span className="text-sm font-semibold text-emerald-300">
                {call.status === "ringing" ? "📞 Ringing…" : "🟢 Active Call"}
              </span>
              <span className="text-sm text-muted-foreground">
                from <span className="text-foreground font-mono">{call.customerNumber}</span>
                {" → "}<span className="text-foreground font-mono">{call.assignedNumber}</span>
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-emerald-400">
              {call.status === "ringing" ? (
                <span className="animate-pulse text-yellow-400 font-medium">Ringing…</span>
              ) : call.liveStartedAt ? (
                <LiveCallTimer startedAt={call.liveStartedAt} />
              ) : null}
            </div>
          </div>
        ))}
      </motion.div>
    </AnimatePresence>
  );
}

function matchesSearch(call: CallRecord, search: string) {
  if (!search.trim()) return true;
  const query = search.toLowerCase();
  const callId = call.callId ?? call.id;
  const callerId = call.callerId ?? call.customerNumber;
  return (
    callId.toLowerCase().includes(query) ||
    callerId.toLowerCase().includes(query) ||
    call.customerNumber.toLowerCase().includes(query) ||
    call.assignedNumber.toLowerCase().includes(query)
  );
}

function matchesStatus(call: CallRecord, status: CallLogFilters["status"]) {
  if (status === "all") return true;
  return call.status === status;
}

function matchesDateRange(
  call: CallRecord,
  dateFrom: string,
  dateTo: string
) {
  const callDate = call.callDateTime.slice(0, 10);
  if (dateFrom && callDate < dateFrom) return false;
  if (dateTo && callDate > dateTo) return false;
  return true;
}

import { useEmployeesContext } from "@/features/employees/context/employees-context";

export function CompanyCallsSection({
  companyId,
  direction,
}: CompanyCallsSectionProps) {
  const { getCompanyById, companies, loading: isContextLoading } = useEmployeesContext();
  const company = companies.find((c) => c.id === companyId);
  const isOutOfCredits = (company?.creditsRemaining ?? 0) <= 0;
  const isLocked = company?.status === "SUSPENDED" || company?.status === "DELETED";

  // Track whether we've completed the first load so we don't flash skeleton on polls
  const hasLoadedOnce = !isContextLoading || !!company;

  const [hasAssignedNumber, setHasAssignedNumber] = useState<boolean | null>(null);
  
  useEffect(() => {
    if (isContextLoading || !company) return;
    
    if (company.assignedNumbers) {
      const hasNum = direction === "outbound" 
        ? company.assignedNumbers.some((n: any) => n.direction?.toUpperCase() === "OUTBOUND" || n.direction?.toUpperCase() === "BOTH")
        : company.assignedNumbers.some((n: any) => n.direction?.toUpperCase() === "INBOUND" || n.direction?.toUpperCase() === "BOTH");
        
      setHasAssignedNumber(hasNum);
    } else if (company.assignedNumbers === undefined) {
      // If we are sure it's loaded but there's no array, assume false
      setHasAssignedNumber(false);
    }
  }, [company, direction, isContextLoading]);

  const {
    campaign: outboundCampaign,
    progressPercent,
    handleUpload: handleCampaignUpload,
    startCampaign,
    pauseCampaign,
    resumeCampaign,
    editLead,
    deleteLead,
    clearCampaign,
    forceStopCampaign,
    clearFailedCalls,
    alertData,
    setAlertData,
  } = useCampaign(undefined, companyId);

  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [rescheduleDid, setRescheduleDid] = useState("");
  const [reactivationCampaigns, setReactivationCampaigns] = useState<any[]>([]);
  const [editCampaignId, setEditCampaignId] = useState<string | null>(null);
  const [animationState, setAnimationState] = useState<{title: string, subtitle?: string, type?: "campaign" | "schedule" | "force_stopped"} | null>(null);
  const [persistentFailedLeads, setPersistentFailedLeads] = useState<any[]>([]);
  const [dateError, setDateError] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(`reactivation_state_${companyId || 'default'}_v2`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) setReactivationCampaigns(parsed);
        } catch (e) {}
      } else {
        const oldSaved = localStorage.getItem(`reactivation_state_${companyId || 'default'}`);
        if (oldSaved) {
          try {
            const parsed = JSON.parse(oldSaved);
            if (parsed) setReactivationCampaigns([parsed]);
          } catch (e) {}
        }
      }

      const savedFailed = localStorage.getItem(`pnx_persistent_failed_leads_${companyId || 'default'}`);
      if (savedFailed) {
        try {
          const parsed = JSON.parse(savedFailed);
          const seen = new Set<string>();
          const deduped = parsed.filter((lead: any) => {
            const key = (lead.phone || "").replace(/\D/g, "").slice(-10);
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          localStorage.setItem(`pnx_persistent_failed_leads_${companyId || 'default'}`, JSON.stringify(deduped));
          setPersistentFailedLeads(deduped);
        } catch (e) {}
      }
    }
  }, [companyId]);

  const shouldShowIdleReactivation = (hasAssignedNumber ?? true) && persistentFailedLeads.length > 0;

  useEffect(() => {
    const interval = setInterval(() => {
      setReactivationCampaigns(prev => {
        let hasChanges = false;
        const now = Date.now();
        const next = prev.map(camp => {
          if (camp.status === "scheduled" && camp.scheduledAt && now >= new Date(camp.scheduledAt).getTime()) {
            hasChanges = true;
            
            setAnimationState({
              title: "Reactivation Started!",
              subtitle: `Reactivation campaign "${camp.name || 'Lead Reactivation'}" is now running.`
            });
            
            setTimeout(() => {
              setAnimationState({
                title: "Reactivation Completed ✅",
                subtitle: `All leads in "${camp.name || 'Lead Reactivation'}" have been processed.`
              });
                
              setReactivationCampaigns(current => {
                 const updated = current.map(c => c.id === camp.id ? { ...c, status: "completed" as any } : c);
                 localStorage.setItem(`reactivation_state_${companyId || 'default'}_v2`, JSON.stringify(updated));
                 return updated;
              });
            }, 4000);
            
            return { ...camp, status: "running" };
          }
          return camp;
        });
        
        if (hasChanges) {
           localStorage.setItem(`reactivation_state_${companyId || 'default'}_v2`, JSON.stringify(next));
           return next;
        }
        return prev;
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [companyId]);

  // Removed the useEffect that automatically opened the reschedule modal on load

  // Intercept alertData to show animation instead if it matches success criteria
  useEffect(() => {
    if (alertData && !alertData.isError) {
      if (alertData.title === "Campaign Completed" || alertData.title === "Campaign Force Stopped" || alertData.title.includes("Scheduled ✓") || alertData.title.includes("Reactivation Scheduled")) {
        setAnimationState({
          title: alertData.title.replace(" ✓", ""),
          subtitle: alertData.description,
          type: alertData.title === "Campaign Force Stopped" ? "force_stopped" : (alertData.title.includes("Scheduled") ? "schedule" : "campaign")
        });
        // Clear the alertData so the small dialog doesn't show for these
        setAlertData(null);
        
        // Clear campaign state IMMEDIATELY so the card resets to "No Campaign" right away
        if (!outboundCampaign.isReactivation && alertData.title === "Campaign Completed") {
          const newlyFailed = outboundCampaign.leads?.filter((l: any) => l.isFailed) || [];
          if (newlyFailed.length > 0) {
            setPersistentFailedLeads(prev => {
              const combined = [...prev, ...newlyFailed];
              const seen = new Set<string>();
              const deduped = combined.filter((lead: any) => {
                const key = (lead.phone || "").replace(/\D/g, "").slice(-10);
                if (!key || seen.has(key)) return false;
                seen.add(key);
                return true;
              });
              localStorage.setItem(`pnx_persistent_failed_leads_${companyId || 'default'}`, JSON.stringify(deduped));
              return deduped;
            });
          }
        } else if (outboundCampaign.isReactivation && alertData.title === "Campaign Completed") {
          setPersistentFailedLeads([]);
          localStorage.removeItem(`pnx_persistent_failed_leads_${companyId || 'default'}`);
        }
        
        if (alertData.title === "Campaign Completed" || alertData.title === "Campaign Force Stopped") {
          clearCampaign();
        }
      }
    }
  }, [alertData, setAlertData, clearCampaign]);

  const handleReschedule = async () => {
    try {
      setIsRescheduling(true);
      const token = localStorage.getItem("accessToken") || localStorage.getItem("access_token");
      
      const editingCamp = editCampaignId ? reactivationCampaigns.find(c => c.id === editCampaignId) : null;
      const failedLeads = editingCamp 
        ? editingCamp.leads 
        : persistentFailedLeads;
      const scheduledAt = new Date(`${rescheduleDate}T${rescheduleTime}`).toISOString();
      const didNumber = rescheduleDid || outboundCampaign.selectedDid || company?.assignedNumbers?.find((n: any) => n.direction === "OUTBOUND" || n.direction === "BOTH")?.number;

      // Derive channels from selected DID's config
      const didInfo = (company?.assignedNumbers as any[] || []).find((n: any) => n.number === didNumber);
      const channels = didInfo?.channels ?? 1;

      if (!didNumber) {
        throw new Error("Please select an outbound number to use for reactivation.");
      }

      if (failedLeads.length === 0) {
        throw new Error("No failed leads to reschedule.");
      }

      const res = await fetch("/api/calls/reschedule", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          campaignId: outboundCampaign.id || "manual",
          leads: failedLeads,
          scheduledAt,
          didNumber,
          channels
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to reschedule calls");
      }
      
      setAlertData({
        title: "Reactivation Scheduled ✓",
        description: `Successfully scheduled ${failedLeads.length} failed call(s) for ${new Date(scheduledAt).toLocaleString()}.`
      });
      const newState = {
        ...leadReactivationCampaign,
        id: editCampaignId || `react-${Date.now()}`,
        status: "scheduled",
        scheduledAt,
        totalContacts: failedLeads.length,
        leads: failedLeads.map((l: any) => ({ ...l, isFailed: false, called: false }))
      };
      
      setReactivationCampaigns(prev => {
         let next;
         if (editCampaignId) {
            next = prev.map(c => c.id === editCampaignId ? { ...c, scheduledAt, leads: newState.leads, totalContacts: newState.totalContacts } : c);
         } else {
            next = [...prev, newState];
         }
         localStorage.setItem(`reactivation_state_${companyId || 'default'}_v2`, JSON.stringify(next));
         return next;
      });

      if (!editCampaignId) {
        setPersistentFailedLeads([]);
        localStorage.removeItem(`pnx_persistent_failed_leads_${companyId || 'default'}`);
      }
      
      setRescheduleOpen(false);
      
      if (!editCampaignId) {
        clearFailedCalls();
      }
      setEditCampaignId(null);
      setRescheduleDate("");
      setRescheduleTime("");
    } catch (e: any) {
      setAlertData({ title: "Error", description: e.message, isError: true });
    } finally {
      setIsRescheduling(false);
    }
  };


  const [isRequestLocked, setIsRequestLocked] = useState(() => {
    if (typeof window !== "undefined") {
      const key = `last_${direction}_number_request_${companyId}`;
      const lastRequest = localStorage.getItem(key);
      if (lastRequest) {
        const hoursSince = (Date.now() - parseInt(lastRequest)) / (1000 * 60 * 60);
        if (hoursSince < 24) return true;
      }
    }
    return false;
  });
  const [isLockChecking, setIsLockChecking] = useState(true);
  const [reminding, setReminding] = useState(false);
  const [remindMessage, setRemindMessage] = useState<{text: string, type: string} | null>(null);

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (isContextLoading || hasAssignedNumber === null) return;
    const key = `last_${direction}_number_request_${companyId}`;
    
    if (hasAssignedNumber) {
      // If they already have a number, clear the lock and don't show the error
      localStorage.removeItem(key);
      setIsRequestLocked(false);
      setRemindMessage(null);
      setIsLockChecking(false);
      return;
    }

    // Check local storage first for immediate UI update
    const lastRequest = localStorage.getItem(key);
    let lockedLocally = false;
    if (lastRequest) {
      const hoursSince = (Date.now() - parseInt(lastRequest)) / (1000 * 60 * 60);
      if (hoursSince < 24) {
        setIsRequestLocked(true);
        lockedLocally = true;
      } else {
        localStorage.removeItem(key);
      }
    }

    // Also verify with backend to ensure lock state is consistent across devices/sessions
    const checkDbLockStatus = async () => {
      try {
        const storedUserStr = localStorage.getItem("user");
        if (!storedUserStr) { setIsLockChecking(false); return; }
        const user = JSON.parse(storedUserStr);
        const email = user.email || user.id;
        if (!email) { setIsLockChecking(false); return; }

        const adminBase = process.env.NEXT_PUBLIC_ADMIN_URL || "https://admin.propnexai.com";
        const res = await fetch(`${adminBase}/api/number-requests?email=${encodeURIComponent(email)}&companyId=${encodeURIComponent(companyId)}&type=${encodeURIComponent(direction.toUpperCase())}`);
        if (res.ok) {
          const data = await res.json();
          if (data.locked) {
            setIsRequestLocked(true);
            localStorage.setItem(key, Date.now().toString());
          }
        }
      } catch (e) {
        // Silent catch for DB check
      } finally {
        setIsLockChecking(false);
      }
    };
    checkDbLockStatus();
  }, [direction, companyId, hasAssignedNumber, isContextLoading]);

  const handleRemindAdmin = async () => {
    try {
      setReminding(true);
      setRemindMessage(null);
      const token = localStorage.getItem("accessToken") || localStorage.getItem("access_token");
      const storedUserStr = localStorage.getItem("user");
      const user = storedUserStr ? JSON.parse(storedUserStr) : {};
      const email = user.email || user.id || "default";

      const adminBase = process.env.NEXT_PUBLIC_ADMIN_URL || "https://admin.propnexai.com";
      const res = await fetch(`${adminBase}/api/number-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          companyId,
          name: `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Unknown",
          type: direction.toUpperCase()
        })
      });

      if (res.ok) {
        setRemindMessage({ text: "Reminder sent successfully! Admin notified.", type: "success" });
        localStorage.setItem(`last_${direction}_number_request_${companyId}`, Date.now().toString());
        setIsRequestLocked(true);
      } else if (res.status === 429) {
        setRemindMessage({ text: "You can only request once every 24 hours.", type: "error" });
        localStorage.setItem(`last_${direction}_number_request_${companyId}`, Date.now().toString());
        setIsRequestLocked(true);
      } else {
        setRemindMessage({ text: "Failed to send reminder. Please try again.", type: "error" });
      }
    } catch (e) {
      setRemindMessage({ text: "Error sending reminder.", type: "error" });
    }
    setReminding(false);
  };

  const [filters, setFilters] = useState<CallLogFilters>(DEFAULT_CALL_FILTERS);
  const [page, setPage] = useState(1);
  const [selectedCall, setSelectedCall] = useState<CallRecord | null>(null);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  const {
    calls: paginatedCalls,
    total: totalItems,
    totalPages,
    loading,
    error,
  } = useInboundCallsApi(filters, page, 0, true, companyId, direction);

  const updateFilters = (next: CallLogFilters) => {
    setFilters(next);
    setPage(1);
  };

  const resetFilters = () => {
    setFilters(DEFAULT_CALL_FILTERS);
    setPage(1);
  };

  const Icon = direction === "inbound" ? PhoneIncoming : PhoneOutgoing;
  const title = direction === "inbound" ? "Inbound Calls" : "Outbound Calls";
  const description =
    direction === "inbound"
      ? totalItems > 0 
        ? `${totalItems} incoming call${totalItems === 1 ? '' : 's'} found`
        : "Incoming calls handled for this sub-company"
      : totalItems > 0
        ? `${totalItems} outgoing call${totalItems === 1 ? '' : 's'} found`
        : "Outgoing campaigns and calls for this sub-company";

  const handleViewTranscript = (call: CallRecord) => {
    setSelectedCall(call);
    setTranscriptOpen(true);
  };

  const handleUpload = (fileName: string, leads: any[] = [], selectedDid?: string, channels?: number) => {
    handleCampaignUpload(fileName, leads, selectedDid, channels ?? 1);
    setUploadOpen(false);
  };

  // Only show skeleton on the very first load (no data yet), NOT during polling re-renders
  if (isContextLoading && !hasLoadedOnce) {
    return (
      <div className="space-y-4">
        <div className="h-32 w-full animate-pulse rounded-xl bg-muted" />
        <div className="h-32 w-full animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {animationState && (
        <CompletionAnimation 
          title={animationState.title} 
          subtitle={animationState.subtitle} 
          type={animationState.type ?? "campaign"}
          onComplete={() => setAnimationState(null)} 
        />
      )}
      {direction === "outbound" ? (
        <>
        <AnimatePresence>
          {reactivationCampaigns.map(camp => (
            <motion.div
              key={camp.id}
              initial={{ opacity: 0, y: -20, height: 0, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, height: 'auto', scale: 1 }}
              exit={{ opacity: 0, y: -20, height: 0, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 200, damping: 20 }}
              className="overflow-hidden"
            >
              <CampaignCard
                campaign={camp}
                progressPercent={0}
                onUploadClick={() => {}}
                onStart={() => {}}
                onPause={() => {}}
                onResume={() => {}}
                onSchedule={() => {
                  setEditCampaignId(camp.id);
                  if (camp.scheduledAt) {
                    const d = new Date(camp.scheduledAt);
                    setRescheduleDate(d.toISOString().split("T")[0]);
                    setRescheduleTime(d.toTimeString().split(" ")[0].slice(0, 5));
                  }
                  setRescheduleOpen(true);
                }}
                onEditLead={(idx, newLead) => {
                  setReactivationCampaigns(prev => {
                    const next = prev.map(c => 
                      c.id === camp.id 
                        ? { ...c, leads: c.leads.map((l: any, i: number) => i === idx ? newLead : l) } 
                        : c
                    );
                    localStorage.setItem(`reactivation_state_${companyId || 'default'}_v2`, JSON.stringify(next));
                    return next;
                  });
                }}
                onDeleteLead={(idx) => {
                  setReactivationCampaigns(prev => {
                    const next = prev.map(c => 
                      c.id === camp.id 
                        ? { 
                            ...c, 
                            leads: c.leads.filter((_: any, i: number) => i !== idx),
                            totalContacts: Math.max(0, c.totalContacts - 1)
                          } 
                        : c
                    );
                    localStorage.setItem(`reactivation_state_${companyId || 'default'}_v2`, JSON.stringify(next));
                    return next;
                  });
                }}
                failedCallsCount={0}
                hasOutboundNumber={hasAssignedNumber ?? true}
                companyId={companyId}
              />
            </motion.div>
          ))}

          {shouldShowIdleReactivation && (
            <motion.div
              initial={{ opacity: 0, y: -20, height: 0, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, height: 'auto', scale: 1 }}
              exit={{ opacity: 0, y: -20, height: 0, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 200, damping: 20 }}
              className="overflow-hidden"
            >
              <CampaignCard
                campaign={{ 
                  ...leadReactivationCampaign, 
                  leads: persistentFailedLeads,
                  failedCalls: persistentFailedLeads.length
                }}
                progressPercent={0}
                onUploadClick={() => {}}
                onStart={() => {}}
                onPause={() => {}}
                onResume={() => {}}
                onClear={() => {
                  setPersistentFailedLeads([]);
                  localStorage.removeItem(`pnx_persistent_failed_leads_${companyId || 'default'}`);
                }}
                onEditLead={() => {}}
                onDeleteLead={() => {}}
                onSchedule={() => {
                  if (persistentFailedLeads.length === 0) return;
                  setEditCampaignId(null);
                  setRescheduleDate("");
                  setRescheduleTime("");
                  setRescheduleOpen(true);
                }}
                failedCallsCount={persistentFailedLeads.length}
                disableSchedule={persistentFailedLeads.length === 0}
                scheduleDisabledReason="No unscheduled failed calls available."
                hasOutboundNumber={hasAssignedNumber ?? true}
                companyId={companyId}
              />
            </motion.div>
          )}
        </AnimatePresence>
          <CampaignCard
              campaign={(hasAssignedNumber ?? true) ? outboundCampaign : { ...outboundCampaign, status: "idle", leads: [], failedCalls: 0, completedCalls: 0 }}
              progressPercent={(hasAssignedNumber ?? true) ? progressPercent : 0}
            onUploadClick={() => setUploadOpen(true)}
            onStart={() => {
              startCampaign();
            }}
            onPause={pauseCampaign}
            onResume={resumeCampaign}
            onClear={clearCampaign}
            onForceStop={forceStopCampaign}
            onEditLead={editLead}
            onDeleteLead={deleteLead}
            hasOutboundNumber={hasAssignedNumber ?? true}
            companyId={companyId}
          />
        </>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-lg bg-muted">
              <Icon className="size-5 text-foreground" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">{title}</h2>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          </div>

          {!isLocked && (
              <div className="flex flex-col gap-2 items-end">
                {hasAssignedNumber === false ? (
                  !isMounted ? (
                  <div className="h-10 w-52 bg-muted/50 animate-pulse rounded-md border border-border"></div>
                ) : isRequestLocked ? (
                  <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-md text-sm text-muted-foreground border border-border h-10">
                    <CheckCircle2 className="size-4 text-emerald-500" />
                    Request sent (Available in 24h)
                  </div>
                ) : (
                  <Button 
                    onClick={handleRemindAdmin} 
                    disabled={reminding || isLockChecking} 
                    className="gap-2 bg-fuchsia-600 hover:bg-fuchsia-500 text-white h-10 w-52"
                  >
                    <PhoneIncoming className="size-4" />
                    {reminding ? "Sending..." : isLockChecking ? "Checking..." : "Request Inbound Number"}
                  </Button>
                )
              ) : null}
              {remindMessage && !isRequestLocked && isMounted && (
                <p className={`text-xs ${remindMessage.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                  {remindMessage.text}
                </p>
              )}
            </div>
          )}
        </motion.div>
      )}

      {/* ── Live call banner (inbound only) ── */}
      {direction === "inbound" && <ActiveCallBanner calls={paginatedCalls} />}

      <CallLogFiltersBar
        filters={filters}
        onChange={updateFilters}
        onReset={resetFilters}
        searchId={`${companyId}-${direction}-search`}
        hideAssignedNumber={false}
        loading={loading}
      />

      {isLocked ? (
        <EmptyState
          title={isOutOfCredits ? "Locked (0 Credits)" : "Phone Number Pending"}
          description={isOutOfCredits ? "This sub-company has run out of credits. Please add credits to restore access to call logs and capabilities." : "Please wait for the admin to assign a phone number to unlock this feature."}
        >
          {isOutOfCredits && (
            <Button onClick={() => setTransferOpen(true)} className="mt-4 bg-primary text-primary-foreground hover:bg-primary/90">
              Add Credits
            </Button>
          )}
        </EmptyState>
      ) : paginatedCalls.length === 0 ? (
        <EmptyState
          title={`No ${direction} calls yet`}
          description="Call records for this sub-company will appear here once available."
        />
      ) : (
        <>
          <CallLogTable
            calls={paginatedCalls}
            variant={direction}
            onViewTranscript={handleViewTranscript}
          />
          <TablePagination
            page={page}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={INBOUND_API_PAGE_SIZE}
            onPageChange={setPage}
          />
        </>
      )}

      <TranscriptDrawer
        call={selectedCall}
        open={transcriptOpen}
        onOpenChange={setTranscriptOpen}
      />

      <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reschedule Failed Calls</DialogTitle>
            <DialogDescription>
              {editCampaignId 
                ? "Update the date and time for this scheduled Reactivation Campaign." 
                : `${outboundCampaign.failedCalls} calls failed during the campaign (via ${outboundCampaign.selectedDid || "your assigned number"}). Select a date and time to automatically retry them using the Lead Reactivation queue.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* DID selector for sub-company reschedule */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Outbound Number (DID)</label>
              <select
                value={rescheduleDid}
                onChange={(e) => setRescheduleDid(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
              >
                <option value="">— Select number —</option>
                {(company?.assignedNumbers as any[] || []).filter((n: any) => !n.direction || n.direction === "OUTBOUND" || n.direction === "BOTH").map((n: any) => (
                  <option key={n.id || n.number} value={n.number}>
                    {n.number}{n.channels ? ` (Ch ${n.channels})` : ""}
                  </option>
                ))}
              </select>
              {(() => {
                const currentDid = rescheduleDid;
                const didInfo = (company?.assignedNumbers as any[] || []).find((n: any) => n.number === currentDid);
                if (currentDid && !didInfo?.agentUrl) {
                  return (
                    <p className="text-xs font-medium text-red-500 animate-in fade-in mt-1 flex items-center gap-1">
                      <AlertCircle className="size-3" />
                      Agent URL is not assigned for this number. Please tell the admin to assign it before starting.
                    </p>
                  );
                }
                return null;
              })()}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Failed Leads ({(editCampaignId ? reactivationCampaigns.find(c => c.id === editCampaignId)?.leads || [] : outboundCampaign.leads?.filter((l: any) => l.isFailed) || []).length})</label>
              <div className="max-h-40 overflow-y-auto rounded-md border border-border bg-muted/30 p-2 text-sm">
                {(editCampaignId ? reactivationCampaigns.find(c => c.id === editCampaignId)?.leads || [] : outboundCampaign.leads?.filter((l: any) => l.isFailed) || []).map((lead: any, i: number) => (
                  <div key={i} className="flex justify-between border-b border-border/50 py-1 last:border-0">
                    <span>{lead.name}</span>
                    <span className="font-mono text-muted-foreground">{lead.phone}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Date</label>
                <input 
                  type="date" 
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" 
                  min={new Date().toISOString().split("T")[0]}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Time</label>
                <input 
                  type="time" 
                  value={rescheduleTime}
                  onChange={(e) => setRescheduleTime(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" 
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRescheduleOpen(false)}>Cancel</Button>
            {(() => {
              const currentDid = rescheduleDid;
              const didInfo = (company?.assignedNumbers as any[] || []).find((n: any) => n.number === currentDid);
              const isInvalidDid = !!(currentDid && !didInfo?.agentUrl);
              return (
                <Button onClick={handleReschedule} disabled={isRescheduling || !rescheduleDate || !rescheduleTime || !rescheduleDid || isInvalidDid}>
                  {isRescheduling ? "Scheduling..." : "Schedule Reactivation"}
                </Button>
              );
            })()}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!alertData} onOpenChange={(open) => !open && setAlertData(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {alertData?.isError ? (
                <AlertCircle className="h-5 w-5 text-destructive" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              )}
              {alertData?.title}
            </DialogTitle>
            <DialogDescription>
              {alertData?.description}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setAlertData(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {direction === "outbound" && (
        <UploadCsvModal
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          onUpload={handleUpload}
          title="Upload CSV — Sub-Company Outbound"
          description="Upload a contact list to launch a general outbound calling campaign for this sub-company. CSV should include a phone number column."
          didNumbers={company?.assignedNumbers as any}
        />
      )}

      {company && (
        <TransferCreditsModal
          company={company}
          open={transferOpen}
          onOpenChange={setTransferOpen}
        />
      )}
    </div>
  );
}
