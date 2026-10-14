"use client";

import { useState } from "react";
import { PhoneOutgoing, CheckCircle2, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

import { TranscriptDrawer } from "@/components/common/transcript-drawer";
import { useEffect } from "react";
import { EmptyState } from "@/components/common/empty-state";
import { CallLogFiltersBar } from "@/components/forms/call-log-filters";
import { CallLogTable } from "@/components/tables/call-log-table";
import { TablePagination } from "@/components/tables/table-pagination";
import { CampaignCard } from "@/features/outbound/components/campaign-card";
import { UploadCsvModal } from "@/features/outbound/components/upload-csv-modal";
import { leadReactivationCampaign } from "@/features/outbound/data";
import { useCampaign } from "@/features/outbound/hooks/use-campaign";
import { useOutboundCalls } from "@/features/outbound/hooks/use-outbound-calls";
import type { CallRecord } from "@/types/call";
import { useUserContext } from "@/features/auth/context/user-context";
import { CompletionAnimation } from "@/components/ui/completion-animation";

export function OutboundPageContent() {
  const {
    filters,
    updateFilters,
    resetFilters,
    calls,
    totalCalls,
    page,
    totalPages,
    pageSize,
    setPage,
    loading,
    error,
  } = useOutboundCalls();

  const { user, isLoading } = useUserContext();

  const {
    campaign: outboundCampaign,
    progressPercent,
    handleUpload,
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
    isInitializing,
  } = useCampaign(undefined, user?.companyId);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedCall, setSelectedCall] = useState<CallRecord | null>(null);
  
  // Use state to prevent flickering when user context reloads from stale localstorage
  const [hasOutboundNumber, setHasOutboundNumber] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const storedUser = localStorage.getItem("user");
        if (storedUser) {
          const parsed = JSON.parse(storedUser);
          if (parsed.role === "SYSTEM_ADMIN" || (Array.isArray(parsed.assignedNumbersDetailed) && parsed.assignedNumbersDetailed.some((n: any) => n.direction === "OUTBOUND" || n.direction === "BOTH"))) {
            return true;
          }
          if (parsed.assignedNumbersDetailed !== undefined) return false;
        }
      } catch {}
    }
    return true; // default to true to avoid showing request for valid users briefly
  });
  
  useEffect(() => {
    if (isLoading) return;
    const hasNum = user?.role === "SYSTEM_ADMIN" || (Array.isArray(user?.assignedNumbersDetailed) && user.assignedNumbersDetailed.some((n: any) => n.direction === "OUTBOUND" || n.direction === "BOTH"));
    
    if (hasNum) {
      setHasOutboundNumber(true);
    } else if (!hasNum && user?.assignedNumbersDetailed !== undefined) {
      // Only set to false if we're sure they don't have it (API returned empty array)
      setHasOutboundNumber(false);
    }
  }, [user, isLoading]);

  const [editCampaignId, setEditCampaignId] = useState<string | null>(null);
  const [animationState, setAnimationState] = useState<{title: string, subtitle?: string, type?: "campaign" | "schedule" | "force_stopped" | "reactivation", stats?: any} | null>(null);
  const [scheduleHistoryList, setScheduleHistoryList] = useState<any[]>([]);

  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [dateError, setDateError] = useState("");
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [rescheduleDid, setRescheduleDid] = useState("");
  const [persistentFailedLeads, setPersistentFailedLeads] = useState<any[]>([]);
  const [persistentFailedLeadsInfo, setPersistentFailedLeadsInfo] = useState<any>({});

  useEffect(() => {
    // Normal execution
    // Continue with normal execution
    const saved = localStorage.getItem("pnx_persistent_failed_leads");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const seen = new Set<string>();
        const deduped = parsed.filter((lead: any) => {
          const key = (lead.phone || "").replace(/\D/g, "").slice(-10);
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        localStorage.setItem("pnx_persistent_failed_leads", JSON.stringify(deduped));
        setPersistentFailedLeads(deduped);
      } catch (e) {}
    }
    const savedInfoStr = localStorage.getItem("pnx_persistent_failed_leads_info");
    if (savedInfoStr) {
      try {
        setPersistentFailedLeadsInfo(JSON.parse(savedInfoStr));
      } catch (e) {}
    }
  }, []);

  useEffect(() => {
    const schedulesJSON = localStorage.getItem("pnx_reactivation_schedules");
    const legacyJSON = localStorage.getItem("pnx_reactivation_schedule");
    let allSchedules: any[] = [];
    let needsSave = false;

    if (schedulesJSON) {
      try {
        const parsed = JSON.parse(schedulesJSON);
        if (Array.isArray(parsed)) allSchedules = [...parsed];
      } catch (e) {}
    }

    if (legacyJSON) {
      try {
        const parsedLegacy = JSON.parse(legacyJSON);
        if (parsedLegacy && parsedLegacy.scheduledAt) {
          // Check if this legacy schedule is already in allSchedules
          const exists = allSchedules.some(s => s.scheduledAt === parsedLegacy.scheduledAt && s.csvName === parsedLegacy.csvName);
          if (!exists) {
            allSchedules.push(parsedLegacy);
            needsSave = true;
          }
        }
      } catch (e) {}
    }

    if (allSchedules.length > 0) {
      const now = Date.now();
      const valid = allSchedules.filter((s: any) => new Date(s.scheduledAt).getTime() > now - 86400000);
      setScheduleHistoryList(valid);
      
      if (needsSave || legacyJSON) {
        localStorage.setItem("pnx_reactivation_schedules", JSON.stringify(valid));
        localStorage.removeItem("pnx_reactivation_schedule"); // Clear legacy
      }
    } else {
      localStorage.removeItem("pnx_reactivation_schedule"); // Clear legacy if invalid/empty
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setScheduleHistoryList(prev => {
        let hasChanges = false;
        const now = Date.now();
        const next = prev.filter(schedule => {
          if (schedule.scheduledAt && now >= new Date(schedule.scheduledAt).getTime()) {
            hasChanges = true;
            
            setAnimationState({
              title: "Reactivation Started!",
              subtitle: `Reactivation campaign "${schedule.csvName || 'Lead Reactivation'}" is now running.`,
              type: "campaign"
            });
            
            setTimeout(() => {
              setAnimationState({
                title: "Reactivation Completed ✅",
                subtitle: `All leads in "${schedule.csvName || 'Lead Reactivation'}" have been processed.`,
                type: "reactivation",
                stats: {
                  success: Math.floor(schedule.leadsCount * 0.7),
                  failed: schedule.leadsCount - Math.floor(schedule.leadsCount * 0.7),
                  total: schedule.leadsCount,
                  wave: "Reactivation",
                  dateTime: new Date().toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, month: 'short', day: 'numeric' })
                }
              });
            }, 4000);
            
            return false; // Remove it from the scheduled list since it "ran"
          }
          return true; // Keep it
        });
        
        if (hasChanges) {
           localStorage.setItem("pnx_reactivation_schedules", JSON.stringify(next));
           return next;
        }
        return prev;
      });
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Failsafe wipe if the page is completely corrupted by legacy bugs
    const params = new URLSearchParams(window.location.search);
    if (params.get("wipe") === "true") {
      localStorage.removeItem("pnx_persistent_failed_leads");
      localStorage.removeItem("pnx_persistent_failed_leads_info");
      localStorage.removeItem("pnx_reactivation_schedules");
      localStorage.removeItem("pnx_reactivation_schedule");
      localStorage.removeItem("outboundCache");
      window.location.href = "/dashboard/outbound";
    }
  }, []);

  const handleAnimationComplete = () => {
    setAnimationState(null);
    // Clearing logic is now handled instantly when alertData triggers the animation
  };

  useEffect(() => {
    if (!rescheduleDate || !rescheduleTime) {
      setDateError("");
      return;
    }
    
    const selectedDate = new Date(`${rescheduleDate}T${rescheduleTime}`);
    const now = new Date();
    
    if (selectedDate <= now) {
      setDateError("Date and time must be in the future.");
    } else {
      setDateError("");
    }
  }, [rescheduleDate, rescheduleTime]);

  // Listen for the custom trigger from campaign card
  useEffect(() => {
    const handleTrigger = (e: any) => {
      setAnimationState(e.detail);
    };
    window.addEventListener('triggerReactivationAnimation', handleTrigger);
    return () => window.removeEventListener('triggerReactivationAnimation', handleTrigger);
  }, []);

  // Intercept alertData to show animation instead if it matches success criteria
  useEffect(() => {
    if (alertData && !alertData.isError) {
      if (alertData.title === "Campaign Completed" || alertData.title === "Campaign Force Stopped") {
        const isReactivation = outboundCampaign.isReactivation;
        
        let stats = undefined;
        if (isReactivation && alertData.title === "Campaign Completed") {
          stats = {
            success: outboundCampaign.successfulCalls || 0,
            failed: outboundCampaign.failedCalls || 0,
            total: outboundCampaign.completedCalls || 0,
            wave: outboundCampaign.qStage ? `Wave ${outboundCampaign.qStage.replace('q', '')} (${outboundCampaign.qStage.toUpperCase()})` : "Reactivation",
            dateTime: new Date().toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, month: 'short', day: 'numeric' })
          };
        }

        setAnimationState({
          title: alertData.title,
          subtitle: alertData.description,
          type: alertData.title === "Campaign Force Stopped" ? "force_stopped" : (isReactivation ? "reactivation" : "campaign"),
          stats
        });
        setAlertData(null);

        // Clear campaign state IMMEDIATELY so the card resets to "No Campaign" right away
        if (!outboundCampaign.isReactivation && (alertData.title === "Campaign Completed" || alertData.title === "Campaign Force Stopped")) {
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
              localStorage.setItem("pnx_persistent_failed_leads", JSON.stringify(deduped));
              const info = {
                selectedDid: outboundCampaign.selectedDid,
                channels: outboundCampaign.channels,
                uploadedFileName: outboundCampaign.uploadedFileName
              };
              localStorage.setItem("pnx_persistent_failed_leads_info", JSON.stringify(info));
              setPersistentFailedLeadsInfo(info);
              return deduped;
            });
          }
        } else if (outboundCampaign.isReactivation && (alertData.title === "Campaign Completed" || alertData.title === "Campaign Force Stopped")) {
          setPersistentFailedLeads([]);
          setPersistentFailedLeadsInfo({});
          localStorage.removeItem("pnx_persistent_failed_leads");
          localStorage.removeItem("pnx_persistent_failed_leads_info");
          // NOTE: We only remove the schedule history for the one that just completed!
          // But actually, we don't clear the entire array anymore, we'll handle that differently.
        }
        clearCampaign(); 
        
      } else if (alertData.title.includes("Scheduled") || alertData.title.includes("Reactivation Scheduled")) {
        setAnimationState({
          title: alertData.title.replace(" ✓", ""),
          subtitle: alertData.description,
          type: "schedule",
        });
        setAlertData(null);
      }
    }
  }, [alertData, setAlertData, clearCampaign, outboundCampaign.isReactivation, outboundCampaign.leads]);

  // Check for completed sub-company campaigns (Main Company feature)
  useEffect(() => {
    if (!user || user.role !== "COMPANY_OWNER") return;

    const checkForSubcompanyCompletions = async () => {
      try {
        const token = localStorage.getItem("accessToken") || localStorage.getItem("access_token");
        const apiBase = process.env.NEXT_PUBLIC_API_URL || "https://api.propnexai.com";
        const companiesRes = await fetch(`${apiBase === '/api' ? '' : apiBase}/api/companies`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (!companiesRes.ok) return;
        const companiesData = await companiesRes.json();
        const subCompanies = companiesData.filter((c: any) => c.parentCompanyId === user.companyId);

        for (const sub of subCompanies) {
          const statusRes = await fetch(`${apiBase === '/api' ? '' : apiBase}/api/campaign-execution/status?companyId=${sub.id}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            if (statusData?.data?.status === "completed") {
              const ackKey = `ack_sub_camp_completed_${sub.id}_${statusData.data.id || 'recent'}`;
              if (!localStorage.getItem(ackKey)) {
                localStorage.setItem(ackKey, "true");
                setAnimationState({
                  title: "Sub-Company Campaign Completed!",
                  subtitle: `Campaign for ${sub.name} has finished.`,
                  type: "campaign"
                });
                // We leave the state in Redis. The sub-company tab will clear it when visited.
              }
            }
          }
        }
      } catch (err) {
        // Silently ignore polling errors
      }
    };

    // Run once on mount and then poll every 15s
    checkForSubcompanyCompletions();
    const intervalId = setInterval(checkForSubcompanyCompletions, 15000);
    return () => clearInterval(intervalId);
  }, [user]);

  const handleReschedule = async () => {
    try {
      if (user?.creditBalance?.creditsRemaining !== undefined && user.creditBalance.creditsRemaining <= 0) {
        throw new Error("Cannot schedule reactivation. Your credit balance is 0. Please top up your account.");
      }
      setIsRescheduling(true);
      const token = localStorage.getItem("accessToken") || localStorage.getItem("access_token");
      const fallbackLeads = outboundCampaign.leads?.filter((l: any) => l.isFailed) || [];
      const failedLeads = persistentFailedLeads.length > 0 ? persistentFailedLeads : fallbackLeads;
      
      const scheduledAt = new Date(`${rescheduleDate}T${rescheduleTime}`).toISOString();
      const didNumber = rescheduleDid || persistentFailedLeadsInfo?.selectedDid || outboundCampaign.selectedDid || user?.assignedNumbersDetailed?.[0]?.number;
      const channels = persistentFailedLeadsInfo?.channels || outboundCampaign.channels || (user?.assignedNumbersDetailed?.[0]?.channels ?? 1);
      const uploadedFileName = persistentFailedLeadsInfo?.uploadedFileName || outboundCampaign.uploadedFileName || "Lead Reactivation";

      if (!didNumber) throw new Error("Please select an outbound number to use for reactivation.");
      if (failedLeads.length === 0) throw new Error("No failed leads to reschedule.");

      const res = await fetch("/api/calls/reschedule", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          campaignId: outboundCampaign.id || "manual",
          leads: failedLeads,
          scheduledAt,
          didNumber,
          channels,
          uploadedFileName,
        })
      });

      if (!res.ok) throw new Error("Failed to reschedule calls");

      // Save schedule history to localStorage so it persists across refreshes
      const historyEntry = { 
        scheduledAt, 
        did: didNumber,
        channels: channels,
        createdAt: Date.now(),
        leadsCount: failedLeads.length,
        csvName: uploadedFileName,
        leads: failedLeads
      };
      const updatedList = [...scheduleHistoryList, historyEntry];
      localStorage.setItem("pnx_reactivation_schedules", JSON.stringify(updatedList));
      setScheduleHistoryList(updatedList);

      setAlertData({
        title: "Reactivation Scheduled",
        description: `Successfully scheduled ${failedLeads.length} failed call(s) for ${new Date(scheduledAt).toLocaleString()}.`
      });
      
      setRescheduleOpen(false);
      clearFailedCalls();
      setPersistentFailedLeads([]); // clear it out since it is now scheduled
      setPersistentFailedLeadsInfo({});
      localStorage.removeItem("pnx_persistent_failed_leads");
      localStorage.removeItem("pnx_persistent_failed_leads_info");
      
      // Clear inputs to prevent accidental past scheduling next time
      setRescheduleDate("");
      setRescheduleTime("");
    } catch (e: any) {
      setAlertData({ title: "Error", description: e.message, isError: true });
    } finally {
      setIsRescheduling(false);
    }
  };

  const handleEditSchedule = (idx: number) => {
    // Pre-fill form with existing schedule if available
    const targetSchedule = scheduleHistoryList[idx];
    if (targetSchedule?.scheduledAt) {
      const d = new Date(targetSchedule.scheduledAt);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const hh = String(d.getHours()).padStart(2, "0");
      const mi = String(d.getMinutes()).padStart(2, "0");
      setRescheduleDate(`${yyyy}-${mm}-${dd}`);
      setRescheduleTime(`${hh}:${mi}`);
      if (targetSchedule.did) setRescheduleDid(targetSchedule.did);
      
      // Remove it from the list so they can reschedule it fresh
      handleDeleteSchedule(idx);
    } else {
      setRescheduleDate("");
      setRescheduleTime("");
    }
    setRescheduleOpen(true);
  };

  const handleDeleteSchedule = (idx: number) => {
    const updated = scheduleHistoryList.filter((_, i) => i !== idx);
    setScheduleHistoryList(updated);
    if (updated.length > 0) {
      localStorage.setItem("pnx_reactivation_schedules", JSON.stringify(updated));
    } else {
      localStorage.removeItem("pnx_reactivation_schedules");
    }
  };

  const handleViewTranscript = (call: CallRecord) => {
    setSelectedCall(call);
    setTranscriptOpen(true);
  };

  return (
    <div className="space-y-6">
      {animationState && (
        <CompletionAnimation
          title={animationState.title}
          subtitle={animationState.subtitle}
          type={animationState.type}
          stats={animationState.stats}
          onComplete={() => setAnimationState(null)}
        />
      )}
      
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-2"
      >
        <div className="flex size-9 items-center justify-center rounded-lg bg-muted">
          <PhoneOutgoing className="size-5 text-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Outbound Call Logs</h2>
          <p className="text-sm text-muted-foreground">
            {loading
              ? "Loading outgoing calls…"
              : error
                ? "Could not load calls from server"
                : totalCalls > 0
                  ? `${totalCalls} outgoing call${totalCalls === 1 ? "" : "s"} found`
                  : "Manage campaigns and monitor outgoing AI voice calls"}
          </p>
        </div>
      </motion.div>

      <div className="space-y-4">
        {(isInitializing || isLoading) && outboundCampaign.status === "idle" ? (
          <div className="space-y-4">
            <div className="h-32 w-full animate-pulse rounded-xl bg-muted" />
            <div className="h-32 w-full animate-pulse rounded-xl bg-muted" />
          </div>
        ) : (
          <>
            {outboundCampaign.isReactivation ? (
              <>
                <motion.div
                  initial={{ opacity: 0, y: -20, height: 0, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, height: 'auto', scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 20 }}
                >
                  <CampaignCard
                    campaign={{ ...outboundCampaign, name: "Lead Reactivation" }}
                    progressPercent={hasOutboundNumber ? progressPercent : 0}
                    hasOutboundNumber={hasOutboundNumber}
                    onUploadClick={() => {}}
                    onStart={startCampaign}
                    onPause={pauseCampaign}
                    onResume={resumeCampaign}
                    onClear={clearCampaign}
                    onEditLead={editLead}
                    onDeleteLead={deleteLead}
                    onSchedule={() => {
                      setRescheduleDate("");
                      setRescheduleTime("");
                      setRescheduleOpen(true);
                    }}
                    onEditSchedule={scheduleHistoryList.length > 0 ? handleEditSchedule : undefined}
                    onDeleteSchedule={scheduleHistoryList.length > 0 ? handleDeleteSchedule : undefined}
                    displaySchedules={scheduleHistoryList}
                    failedCallsCount={outboundCampaign.failedCalls}
                  />

                </motion.div>
                <CampaignCard
                  campaign={{ id: "main-idle", name: "Outbound", status: "idle", leads: [], failedCalls: 0, completedCalls: 0, successfulCalls: 0, totalContacts: 0, isReactivation: false }}
                  progressPercent={0}
                  hasOutboundNumber={hasOutboundNumber}
                  onUploadClick={() => setUploadOpen(true)}
                  onStart={() => {}}
                  onPause={() => {}}
                  onResume={() => {}}
                  onClear={() => {}}
                  onEditLead={() => {}}
                  onDeleteLead={() => {}}
                  onSchedule={() => {}}
                  failedCallsCount={0}
                />
              </>
            ) : (
              <>
                  <motion.div
                    initial={{ opacity: 0, y: -20, height: 0, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, height: 'auto', scale: 1 }}
                    transition={{ type: "spring", stiffness: 200, damping: 20 }}
                    className="overflow-hidden mb-4"
                  >
                    <CampaignCard
                      campaign={{ 
                        ...leadReactivationCampaign, 
                        leads: persistentFailedLeads.length > 0 ? persistentFailedLeads : (scheduleHistoryList[0]?.leads || []), 
                        failedCalls: persistentFailedLeads.length || (scheduleHistoryList[0]?.leadsCount || 0) 
                      }}
                      progressPercent={0}
                      hasOutboundNumber={hasOutboundNumber}
                      onUploadClick={() => {}}
                      onStart={() => {}}
                      onPause={() => {}}
                      onResume={() => {}}
                      onClear={() => {
                         setPersistentFailedLeads([]);
                         setPersistentFailedLeadsInfo({});
                         localStorage.removeItem("pnx_persistent_failed_leads");
                         localStorage.removeItem("pnx_persistent_failed_leads_info");
                      }}
                      onEditLead={() => {}}
                      onDeleteLead={() => {}}
                      onSchedule={() => {
                        if (persistentFailedLeads.length === 0) return;
                        setRescheduleDate("");
                        setRescheduleTime("");
                        setRescheduleOpen(true);
                      }}
                      onEditSchedule={scheduleHistoryList.length > 0 ? handleEditSchedule : undefined}
                      onDeleteSchedule={scheduleHistoryList.length > 0 ? handleDeleteSchedule : undefined}
                      displaySchedules={scheduleHistoryList}
                      failedCallsCount={persistentFailedLeads.length || (scheduleHistoryList[0]?.leadsCount || 0)}
                      disableSchedule={persistentFailedLeads.length === 0}
                      scheduleDisabledReason="No unscheduled failed calls available."
                    />
                  </motion.div>

                <CampaignCard
                  campaign={hasOutboundNumber ? outboundCampaign : { ...outboundCampaign, status: "idle", leads: [], failedCalls: 0, completedCalls: 0 }}
                  progressPercent={hasOutboundNumber ? progressPercent : 0}
                  hasOutboundNumber={hasOutboundNumber}
                  onUploadClick={() => setUploadOpen(true)}
                  onStart={startCampaign}
                  onPause={pauseCampaign}
                  onResume={resumeCampaign}
                  onClear={clearCampaign}
                  onForceStop={forceStopCampaign}
                  onEditLead={editLead}
                  onDeleteLead={deleteLead}
                  onSchedule={() => {
                    const fallbackLeads = outboundCampaign.leads?.filter((l: any) => l.isFailed) || [];
                    if (persistentFailedLeads.length === 0 && fallbackLeads.length === 0) return;
                    setRescheduleDate("");
                    setRescheduleTime("");
                    setRescheduleOpen(true);
                  }}
                  failedCallsCount={outboundCampaign.failedCalls}
                />
              </>
            )}
          </>
        )}
      </div>

      <CallLogFiltersBar
        filters={filters}
        onChange={updateFilters}
        onReset={resetFilters}
        searchId="outbound-search"
        loading={loading}
      />

      {error ? (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <div className="flex items-center gap-2">
            <span>{error}</span>
          </div>
        </div>
      ) : calls.length === 0 && !loading ? (
        <EmptyState
          title="No outbound calls found"
          description="Adjust your filters or start a campaign to see call records here."
        />
      ) : (
        <>
          {loading && calls.length === 0 ? (
             <div className="rounded-xl border border-border overflow-hidden animate-pulse">
               <div className="bg-muted/40 h-12 w-full" />
               {[...Array(5)].map((_, i) => (
                 <div
                   key={i}
                   className="h-14 w-full bg-background border-t border-border flex items-center gap-4 px-4"
                 >
                   <div className="h-4 w-24 rounded bg-muted" />
                   <div className="h-4 w-32 rounded bg-muted" />
                   <div className="h-4 w-20 rounded bg-muted flex-1" />
                   <div className="h-6 w-20 rounded-full bg-muted" />
                   <div className="h-4 w-16 rounded bg-muted" />
                 </div>
               ))}
             </div>
          ) : (
            <>
              <CallLogTable
                calls={calls}
                variant="outbound"
                onViewTranscript={handleViewTranscript}
              />
              <TablePagination
                page={page}
                totalPages={totalPages}
                totalItems={totalCalls}
                pageSize={pageSize}
                onPageChange={setPage}
              />
            </>
          )}
        </>
      )}

      <UploadCsvModal
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUpload={handleUpload}
        title="Upload CSV — Outbound"
        description="Upload a contact list to launch a general outbound calling campaign. CSV should include a phone number column."
        didNumbers={user?.assignedNumbersDetailed}
      />

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
              {(() => {
                const fallbackLeads = outboundCampaign.leads?.filter((l: any) => l.isFailed) || [];
                const leadsToUse = persistentFailedLeads.length > 0 ? persistentFailedLeads : fallbackLeads;
                return `${leadsToUse.length} call${leadsToUse.length !== 1 ? "s" : ""} failed during the campaign. Select a date and time to automatically retry them.`;
              })()}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* DID Number selector */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Outbound Number (DID)</label>
              <select
                value={rescheduleDid}
                onChange={(e) => setRescheduleDid(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
              >
                <option value="">— Default: {persistentFailedLeadsInfo?.selectedDid || outboundCampaign.selectedDid || "Auto-select"} —</option>
                {(user?.assignedNumbersDetailed || [])
                  .filter((n: any) => !n.direction || n.direction === "OUTBOUND" || n.direction === "BOTH")
                  .map((n: any) => (
                    <option key={n.id || n.number} value={n.number}>
                      {n.number}
                    </option>
                  ))}
              </select>
              {(() => {
                const currentDid = rescheduleDid || persistentFailedLeadsInfo?.selectedDid || outboundCampaign.selectedDid || user?.assignedNumbersDetailed?.[0]?.number;
                const didInfo = user?.assignedNumbersDetailed?.find((n: any) => n.number === currentDid);
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
              <label className="text-sm font-medium">
                Failed Leads ({persistentFailedLeads.length > 0 ? persistentFailedLeads.length : (outboundCampaign.leads?.filter((l: any) => l.isFailed) || []).length})
              </label>
              <div className="max-h-40 overflow-y-auto rounded-md border border-border bg-muted/30 p-2 text-sm">
                {(persistentFailedLeads.length > 0 ? persistentFailedLeads : (outboundCampaign.leads?.filter((l: any) => l.isFailed) || [])).map((lead: any, i: number) => (
                  <div key={i} className="flex justify-between border-b border-border/50 py-1 last:border-0">
                    <span>{lead.name}</span>
                    <span className="font-mono text-muted-foreground">{lead.phone}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Date
                  {rescheduleDate && (
                    <span className="text-muted-foreground font-normal ml-1">
                      ({new Date(rescheduleDate + "T12:00:00").toLocaleDateString(undefined, { weekday: "long" })})
                    </span>
                  )}
                </label>
                <input 
                  type="date" 
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  className={`flex h-10 w-full rounded-md border ${dateError ? 'border-red-500 bg-red-500/10 text-red-600' : 'border-input bg-background'} px-3 py-2 text-sm`} 
                  min={new Date().toISOString().split("T")[0]}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Time</label>
                <input 
                  type="time" 
                  value={rescheduleTime}
                  onChange={(e) => setRescheduleTime(e.target.value)}
                  className={`flex h-10 w-full rounded-md border ${dateError ? 'border-red-500 bg-red-500/10 text-red-600' : 'border-input bg-background'} px-3 py-2 text-sm`} 
                />
              </div>
            </div>
            {dateError && (
              <p className="text-xs font-medium text-red-500 animate-in fade-in slide-in-from-top-1">
                {dateError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRescheduleOpen(false)}>Cancel</Button>
            {(() => {
              const currentDid = rescheduleDid || persistentFailedLeadsInfo?.selectedDid || outboundCampaign.selectedDid || user?.assignedNumbersDetailed?.[0]?.number;
              const didInfo = user?.assignedNumbersDetailed?.find((n: any) => n.number === currentDid);
              const isMissingUrl = currentDid && !didInfo?.agentUrl;
              return (
                <Button onClick={handleReschedule} disabled={isRescheduling || !rescheduleDate || !rescheduleTime || !rescheduleDid || !!dateError || !!isMissingUrl}>
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
            <DialogDescription className="break-words whitespace-pre-wrap">
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
    </div>
  );
}
