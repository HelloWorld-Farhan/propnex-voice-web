"use client";

import { DashboardHeader } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { SidebarChatbot } from "@/components/layout/sidebar-chatbot";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect, useState } from "react";
import { EmployeesProvider } from "@/features/employees/context/employees-context";
import { usePageTitle } from "@/hooks/use-page-title";
import { cn } from "@/lib/utils";
import { usePathname, useRouter } from "next/navigation";
import { useBrand } from "@/components/providers/brand-provider";

type DashboardShellProps = {
  children: React.ReactNode;
  className?: string;
};

function DashboardShellInner({
  children,
  className,
}: DashboardShellProps) {
  const title = usePageTitle();
  const pathname = usePathname();
  const router = useRouter();
  const [isWaiting, setIsWaiting] = useState(false);
  const [isWaitingNumber, setIsWaitingNumber] = useState(false);
  const [isRejected, setIsRejected] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockedUntilDate, setBlockedUntilDate] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reminding, setReminding] = useState(false);
  const [remindMessage, setRemindMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [isRemindDisabled, setIsRemindDisabled] = useState(false);
  const [creditsRemaining, setCreditsRemaining] = useState<number | null>(null);

  const [timeLeft, setTimeLeft] = useState<{ days: number; hours: number; minutes: number; seconds: number } | null>(null);
  const [infraCosts, setInfraCosts] = useState<any[]>([]);
  const { supportEmail, domain } = useBrand();

  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        window.location.reload();
      }
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);
  useEffect(() => {
    if (isBlocked && blockedUntilDate) {
      const timer = setInterval(() => {
        const now = new Date().getTime();
        const future = new Date(blockedUntilDate).getTime();
        const difference = future - now;

        if (difference <= 0) {
          setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
          clearInterval(timer);
          // Reload to re-check status if time is up
          window.location.reload();
        } else {
          setTimeLeft({
            days: Math.floor(difference / (1000 * 60 * 60 * 24)),
            hours: Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
            minutes: Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60)),
            seconds: Math.floor((difference % (1000 * 60)) / 1000),
          });
        }
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [isBlocked, blockedUntilDate]);

  const checkReminderStatus = (userObj?: Record<string, unknown> | null, isNumberReminder?: boolean) => {
    try {
      const user = userObj || (() => {
        const str = localStorage.getItem("user");
        return str ? JSON.parse(str) : null;
      })();
      if (!user) return false;

      const isNumber = isNumberReminder !== undefined ? isNumberReminder : isWaitingNumber;
      const targetTime = isNumber ? user.numberRemindedAt : user.remindedAt;
      
      if (targetTime) {
        const timeSince = Date.now() - new Date(targetTime).getTime();
        if (timeSince < 24 * 60 * 60 * 1000) {
          setIsRemindDisabled(true);
          return true;
        }
      }

      if (isNumber) {
        const localBlock = localStorage.getItem("pnx_number_remind_time");
        if (localBlock && Date.now() - parseInt(localBlock, 10) < 24 * 60 * 60 * 1000) {
          setIsRemindDisabled(true);
          return true;
        }
      }
    } catch(e) {}
    setIsRemindDisabled(false);
    return false;
  };

  const handleRemindAdmin = async () => {
    if (checkReminderStatus()) {
      setRemindMessage({ text: "You can only send a reminder once every 24 hours.", type: "error" });
      return;
    }

    try {
      setReminding(true);
      setRemindMessage(null);
      const token = localStorage.getItem("accessToken") || localStorage.getItem("access_token");
      
      const storedUserStr = localStorage.getItem("user");
      const user = storedUserStr ? JSON.parse(storedUserStr) : {};
      const email = user.email || user.id || "default";

      let res;
      if (isWaitingNumber) {
        // Hit the Admin Panel's number-requests API
        // Using the official admin domain
        const adminBase = process.env.NEXT_PUBLIC_ADMIN_URL || "https://admin.propnexai.com";
        res = await fetch(`${adminBase}/api/number-requests`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            companyId: user.companyId || null,
            name: `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Unknown",
            type: "INBOUND"
          })
        });
      } else {
        // Normal pending approval reminder
        res = await fetch(`/api/users/remind-admin`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}` }
        });
      }
      
      if (res.ok) {
        setIsRemindDisabled(true);
        setRemindMessage({ text: "Reminder sent successfully! The admin has been notified. (24h Lock active)", type: "success" });
        if (isWaitingNumber) {
          localStorage.setItem("pnx_number_remind_time", Date.now().toString());
        }
        
        // Fetch updated user from backend to get the latest timestamp lock
        try {
          const refreshRes = await fetch(`/api/users/me`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (refreshRes.ok) {
            const data = await refreshRes.json();
            if (data.user) {
              localStorage.setItem("user", JSON.stringify(data.user));
              window.dispatchEvent(new Event("user-updated"));
            }
          }
        } catch(e) {}
        
      } else {
        const errData = await res.json().catch(() => ({}));
        if (errData.error === "24h_lock" || res.status === 429 || res.status === 400) {
           setIsRemindDisabled(true);
           setRemindMessage({ text: "You can only send a reminder once every 24 hours.", type: "error" });
        } else {
           setRemindMessage({ text: "Failed to send reminder. Please try again.", type: "error" });
        }
      }
    } catch (e) {
      console.error(e);
      setRemindMessage({ text: "Failed to send reminder. Please check your connection.", type: "error" });
    } finally {
      setReminding(false);
    }
  };

  useEffect(() => {
    const checkState = async () => {
      const token = localStorage.getItem("accessToken") || localStorage.getItem("access_token");
      if (!token) {
        window.location.replace("/");
        return;
      }
      let needsRefresh = false;
      try {
        const storedUser = localStorage.getItem("user");
        if (storedUser) {
          const user = JSON.parse(storedUser);
          if (user.creditBalance !== undefined) {
            setCreditsRemaining(user.creditBalance?.creditsRemaining || 0);
          }
          if (user.status === "SUSPENDED" || user.companyStatus === "SUSPENDED") {
            setIsBlocked(true);
            setBlockedUntilDate(user.companyBlockedUntil || user.blockedUntil);
            needsRefresh = true;
          } else if (user.approvalStatus === "REJECTED") {
            setIsRejected(true);
            if (user.rejectedAt) {
               const rejectDate = new Date(user.rejectedAt);
               rejectDate.setMonth(rejectDate.getMonth() + 6);
               setBlockedUntilDate(rejectDate.toISOString());
            }
            needsRefresh = true;
          } else if (!user.companyId && !user.contractId) {
            setIsWaiting(true);
            checkReminderStatus(user, false);
            needsRefresh = true;
          } else if (!user.assignedNumber || user.assignedNumber === "Not Assigned" || user.assignedNumber === "Unknown") {
            setIsWaitingNumber(true);
            checkReminderStatus(user, true);
            needsRefresh = true;
          }
        } else {
          needsRefresh = true;
        }
      } catch (e) {
        console.error(e);
        needsRefresh = true;
      }

      if (needsRefresh) {
        try {
          const token = localStorage.getItem("accessToken") || localStorage.getItem("access_token");
          if (!token) {
            window.location.replace("/");
            return;
          }
          const response = await fetch(`/api/users/me`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store"
          });
          if (response.ok) {
            const data = await response.json();
            if (data.user) {
              localStorage.setItem("user", JSON.stringify(data.user));
              window.dispatchEvent(new Event("user-updated"));
              if (data.user.creditBalance !== undefined) {
                setCreditsRemaining(data.user.creditBalance?.creditsRemaining || 0);
              }
              if (data.user.status === "SUSPENDED" || data.user.companyStatus === "SUSPENDED") {
                setIsBlocked(true);
                setBlockedUntilDate(data.user.companyBlockedUntil || data.user.blockedUntil);
                setIsWaiting(false);
                setIsWaitingNumber(false);
                setIsRejected(false);
              } else if (data.user.approvalStatus === "REJECTED") {
                setIsRejected(true);
                setIsBlocked(false);
                setIsWaiting(false);
                setIsWaitingNumber(false);
                if (data.user.rejectedAt) {
                  const rejectDate = new Date(data.user.rejectedAt);
                  rejectDate.setMonth(rejectDate.getMonth() + 6);
                  setBlockedUntilDate(rejectDate.toISOString());
                }
              } else if (!data.user.companyId && !data.user.contractId) {
                setIsWaiting(true);
                setIsRejected(false);
                setIsBlocked(false);
                setIsWaitingNumber(false);
                checkReminderStatus(data.user, false);
              } else if (!data.user.assignedNumber || data.user.assignedNumber === "Not Assigned" || data.user.assignedNumber === "Unknown") {
                setIsWaitingNumber(true);
                setIsWaiting(false);
                setIsRejected(false);
                setIsBlocked(false);
                checkReminderStatus(data.user, true);
              } else {
                setIsWaiting(false);
                setIsRejected(false);
                setIsWaitingNumber(false);
                setIsBlocked(false);
              }
            }
          } else if (response.status === 401) {
            // Clear ALL auth data including trusted device memory
            localStorage.removeItem("user");
            localStorage.removeItem("accessToken");
            localStorage.removeItem("access_token");
            localStorage.removeItem("trusted_emails");
            localStorage.removeItem("trusted_devices");
            localStorage.removeItem("login_remember_me");
            window.location.href = "/";
          }
        } catch (e) {
          console.error("Instant refresh error:", e);
        }
      }
      setIsLoading(false);
    };
    checkState();
  }, []);

  const fetchInfraCosts = async (token: string) => {
    try {
      const res = await fetch(`/api/users/me/infra-costs`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store"
      });
      if (res.ok) {
        const data = await res.json();
        setInfraCosts(data);
      }
    } catch (e) {
      console.error("Failed to fetch infra costs", e);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const fetchUser = async () => {
      try {
        const token = localStorage.getItem("accessToken") || localStorage.getItem("access_token");
        if (!token) return;

          const response = await fetch(`/api/users/me`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store"
          });
        
        if (!isMounted) return;

        if (response.ok) {
          const data = await response.json();
          if (data.user) {
            localStorage.setItem("user", JSON.stringify(data.user));
            window.dispatchEvent(new Event("user-updated"));
            if (data.user.creditBalance !== undefined) {
              setCreditsRemaining(data.user.creditBalance?.creditsRemaining || 0);
            }
            if (data.user.status === "SUSPENDED" || data.user.companyStatus === "SUSPENDED") {
              setIsBlocked(true);
              setBlockedUntilDate(data.user.companyBlockedUntil || data.user.blockedUntil);
              setIsWaiting(false);
              setIsWaitingNumber(false);
              setIsRejected(false);
            } else if (data.user.approvalStatus === "REJECTED") {
              setIsRejected(true);
              setIsBlocked(false);
              setIsWaiting(false);
              setIsWaitingNumber(false);
              if (data.user.rejectedAt) {
                 const rejectDate = new Date(data.user.rejectedAt);
                 rejectDate.setMonth(rejectDate.getMonth() + 6);
                 setBlockedUntilDate(rejectDate.toISOString());
              }
            } else if (!data.user.companyId && !data.user.contractId) {
              setIsWaiting(true);
              setIsRejected(false);
              setIsBlocked(false);
              setIsWaitingNumber(false);
              checkReminderStatus(data.user, false);
            } else if (!data.user.assignedNumber || data.user.assignedNumber === "Not Assigned" || data.user.assignedNumber === "Unknown") {
              setIsWaitingNumber(true);
              setIsWaiting(false);
              setIsRejected(false);
              setIsBlocked(false);
              checkReminderStatus(data.user, true);
            } else {
              setIsWaiting(false);
              setIsRejected(false);
              setIsWaitingNumber(false);
              setIsBlocked(false);
            }
          }
        } else if (response.status === 401 || response.status === 404) {
          localStorage.removeItem("user");
          localStorage.removeItem("accessToken");
          localStorage.removeItem("access_token");
          window.location.href = "/";
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    };

    fetchUser();
    
    // Poll every 5 seconds for real-time credit & call updates (actually 30s)
    const interval = setInterval(() => {
      fetchUser();
      const token = localStorage.getItem("accessToken") || localStorage.getItem("access_token");
      if (token) fetchInfraCosts(token);
    }, 30000);

    // Initial fetch of infra costs
    const initialToken = localStorage.getItem("accessToken") || localStorage.getItem("access_token");
    if (initialToken) fetchInfraCosts(initialToken);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isWaiting, isRejected, isWaitingNumber]);

  useEffect(() => {
    // Redirect to billing if credits are zero or below to ensure they can't bypass the block
    if (!isLoading && !isRejected && !isWaiting && !isBlocked && creditsRemaining !== null && creditsRemaining <= 0 && pathname !== "/dashboard/billing") {
      router.push("/dashboard/billing");
    }
  }, [isLoading, isRejected, isWaiting, isBlocked, creditsRemaining, pathname, router]);

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><div className="animate-spin h-8 w-8 rounded-full border-4 border-fuchsia-500 border-r-transparent" /></div>;
  }

  if (isBlocked) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 page-mesh-bg">
        <div className="mx-auto flex max-w-[400px] flex-col items-center justify-center space-y-6 text-center bg-zinc-900/50 backdrop-blur-md p-8 rounded-2xl border border-white/10">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
            <svg
              className="h-8 w-8 text-red-500"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              viewBox="0 0 24 24"
            >
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold tracking-tight text-white">
              Account Suspended
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Your account has been suspended by the administrator for <strong>6 months</strong>. 
              You will regain access automatically when the timer below expires.
            </p>
          </div>
          
          {timeLeft && (
            <div className="flex justify-center gap-3 mt-6 mb-2">
              <div className="flex flex-col items-center">
                <span className="text-3xl font-mono font-bold text-white bg-zinc-800/80 rounded-lg w-16 h-16 flex items-center justify-center shadow-inner border border-zinc-700/50">{String(timeLeft.days).padStart(2, '0')}</span>
                <span className="text-[10px] text-muted-foreground mt-2 font-semibold tracking-wider uppercase">Days</span>
              </div>
              <div className="text-2xl font-bold text-zinc-600 self-start mt-4">:</div>
              <div className="flex flex-col items-center">
                <span className="text-3xl font-mono font-bold text-white bg-zinc-800/80 rounded-lg w-16 h-16 flex items-center justify-center shadow-inner border border-zinc-700/50">{String(timeLeft.hours).padStart(2, '0')}</span>
                <span className="text-[10px] text-muted-foreground mt-2 font-semibold tracking-wider uppercase">Hours</span>
              </div>
              <div className="text-2xl font-bold text-zinc-600 self-start mt-4">:</div>
              <div className="flex flex-col items-center">
                <span className="text-3xl font-mono font-bold text-white bg-zinc-800/80 rounded-lg w-16 h-16 flex items-center justify-center shadow-inner border border-zinc-700/50">{String(timeLeft.minutes).padStart(2, '0')}</span>
                <span className="text-[10px] text-muted-foreground mt-2 font-semibold tracking-wider uppercase">Mins</span>
              </div>
              <div className="text-2xl font-bold text-zinc-600 self-start mt-4">:</div>
              <div className="flex flex-col items-center">
                <span className="text-3xl font-mono font-bold text-white bg-zinc-800/80 rounded-lg w-16 h-16 flex items-center justify-center shadow-inner border border-zinc-700/50">{String(timeLeft.seconds).padStart(2, '0')}</span>
                <span className="text-[10px] text-muted-foreground mt-2 font-semibold tracking-wider uppercase">Secs</span>
              </div>
            </div>
          )}

          <button onClick={() => {
            localStorage.removeItem("user");
            localStorage.removeItem("accessToken");
            localStorage.removeItem("access_token");
            window.location.href = "/";
          }} className="text-sm text-red-400 hover:text-red-300 mt-4 font-medium transition-colors">
            Sign out
          </button>
        </div>
      </div>
    );
  }

  if (isRejected) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 page-mesh-bg">
        <div className="mx-auto flex max-w-[400px] flex-col items-center justify-center space-y-6 text-center bg-zinc-900/50 backdrop-blur-md p-8 rounded-2xl border border-white/10">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
            <svg
              className="h-8 w-8 text-red-500"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              viewBox="0 0 24 24"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold tracking-tight text-white">
              Application Declined
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Your account is blocked for 6 months. For any query contact in this email - <a href={`mailto:${supportEmail || 'support@propnexai.com'}`} className="text-red-400 hover:underline">{supportEmail || 'support@propnexai.com'}</a>
            </p>
          </div>
          <button onClick={() => {
            localStorage.removeItem("user");
            localStorage.removeItem("accessToken");
            localStorage.removeItem("access_token");
            window.location.href = "/";
          }} className="text-sm text-red-400 hover:text-red-300 mt-4 font-medium transition-colors">
            Sign out
          </button>
        </div>
      </div>
    );
  }

  if (isWaiting) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 page-mesh-bg">
        <div className="mx-auto flex max-w-[400px] flex-col items-center justify-center space-y-6 text-center bg-zinc-900/50 backdrop-blur-md p-8 rounded-2xl border border-white/10">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-fuchsia-500/10">
            <svg
              className="h-8 w-8 text-fuchsia-500"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              viewBox="0 0 24 24"
            >
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold tracking-tight text-white">
              Waiting for Approval
            </h2>
            <p className="text-sm text-muted-foreground">
              Your account request has been received. Please wait while an Administrator provisions your portal.
            </p>
          </div>
          <div className="flex flex-col w-full gap-3 mt-4">
            <button 
              onClick={handleRemindAdmin} 
              disabled={reminding || isRemindDisabled}
              className="w-full rounded-md bg-fuchsia-600 px-4 py-2 text-sm font-semibold text-white hover:bg-fuchsia-500 disabled:opacity-50 transition-colors"
            >
              {reminding ? "Sending Reminder..." : isRemindDisabled ? "Reminder Sent (24h Lock)" : "Remind Admin"}
            </button>
            
            {remindMessage && (
              <p className={`text-sm ${remindMessage.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                {remindMessage.text}
              </p>
            )}

            <button onClick={() => {
              localStorage.removeItem("user");
              localStorage.removeItem("accessToken");
              localStorage.removeItem("access_token");
              window.location.href = "/";
            }} className="text-sm text-fuchsia-400 hover:text-fuchsia-300">
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isLockedOut = creditsRemaining !== null && creditsRemaining <= 0;

  return (
    <div className="flex min-h-screen bg-background page-mesh-bg">
      <Sidebar isLockedOut={isLockedOut} />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        {creditsRemaining !== null && creditsRemaining < 100 && (
          <div className="w-full bg-red-500/10 border-b border-red-500/20 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-red-500 text-sm font-medium z-50">
            <div className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
              <span>
                {creditsRemaining <= 0
                  ? "🚨 Account Locked: Your credit balance is 0. All running campaigns, lead reactivations, and outbound services are paused. Please add credits below to unlock the dashboard."
                  : `Warning: Your credit balance is low (${creditsRemaining} credits). Please purchase more credits soon to prevent campaign interruptions.`}
              </span>
            </div>
            {pathname !== "/dashboard/billing" && (
              <button 
                onClick={() => router.push("/dashboard/billing")}
                className="shrink-0 px-4 py-1.5 bg-red-500 hover:bg-red-600 text-white font-semibold text-xs rounded-md transition-colors"
              >
                Add Credit
              </button>
            )}
          </div>
        )}
        <DashboardHeader title={title} isLockedOut={isLockedOut} />
        <main
          className={cn(
            "flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8",
            className
          )}
        >
          {isLockedOut && pathname !== "/dashboard/billing" && (
            <div className="flex h-full flex-col items-center justify-center py-12">
              <div className="text-center space-y-3">
                <h2 className="text-2xl font-bold text-red-500">Dashboard Locked</h2>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Your credit balance is 0. Please purchase more credits to unlock dashboard access.
                </p>
                <div className="mt-8 flex justify-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Redirecting to billing...</p>
              </div>
            </div>
          )}

          <div className={isLockedOut && pathname !== "/dashboard/billing" ? "hidden" : "block"}>
            {isWaitingNumber && pathname === "/dashboard/inbound" && (
              <div className="mb-6 rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-yellow-500/20 text-yellow-500">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-yellow-500">Number Assignment Pending</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Your account is verified, but you need a phone number to make or receive calls.
                      {remindMessage && <span className={`ml-2 font-medium ${remindMessage.type === 'error' ? 'text-red-400' : 'text-green-400'}`}>{remindMessage.text}</span>}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={handleRemindAdmin}
                  disabled={isRemindDisabled || reminding}
                  className="shrink-0 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-black font-semibold text-xs rounded-md transition-colors disabled:opacity-50"
                >
                  {reminding ? "Sending..." : isRemindDisabled ? "Reminder Sent (24h Lock)" : "Remind Admin"}
                </button>
              </div>
            )}
            
            {/* Infra Cost Notifications */}
            {infraCosts.length > 0 && (
              <div className="mb-6 space-y-3">
                {infraCosts.map((cost) => (
                  <div key={cost.id} className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/20 text-red-500">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-red-500">Action Required: Invoice Due</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {cost.message || "You have a pending invoice that needs to be paid. Please make the payment immediately to avoid suspension."}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {children}
          </div>
        </main>
      </div>
      <SidebarChatbot />
    </div>
  );
}

import { UserProvider } from "@/features/auth/context/user-context";

export function DashboardShell({ children, className }: DashboardShellProps) {
  return (
    <UserProvider>
      <TooltipProvider>
        <EmployeesProvider>
          <DashboardShellInner className={className}>{children}</DashboardShellInner>
        </EmployeesProvider>
      </TooltipProvider>
    </UserProvider>
  );
}
