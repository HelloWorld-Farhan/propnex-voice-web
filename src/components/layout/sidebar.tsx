"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { LogOut } from "lucide-react";

import { Logo } from "@/components/common/logo";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MAIN_NAV_ITEMS } from "@/constants/navigation";
import { cn } from "@/lib/utils";
import { SidebarChatbot } from "./sidebar-chatbot";
import { InfraCostAlert } from "./infra-cost-alert";

type SidebarNavProps = {
  onNavigate?: () => void;
  className?: string;
  isLockedOut?: boolean;
};

export function SidebarNav({ onNavigate, className, isLockedOut }: SidebarNavProps) {
  const pathname = usePathname();

  const activeHref = MAIN_NAV_ITEMS.filter(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  ).sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav className={cn("flex flex-col gap-1 px-3", className)}>
      {MAIN_NAV_ITEMS.map((item) => {
        const isActive = item.href === activeHref;
        const Icon = item.icon;
        const isBilling = item.href === "/dashboard/billing";
        const isComingSoon = item.comingSoon && !isLockedOut;
        
        if (isLockedOut && !isBilling) return null;
        
        const isDisabled = isComingSoon;

        return (
          <Link
            key={item.href}
            href={isDisabled ? "#" : item.href}
            prefetch={!isDisabled}
            onClick={(e) => {
              if (isDisabled) {
                e.preventDefault();
                return;
              }
              onNavigate?.();
            }}
            className={cn(
              "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors overflow-hidden",
              isActive && !isComingSoon
                ? "sidebar-active-indicator text-foreground font-semibold"
                : isDisabled
                ? "text-muted-foreground/30 cursor-not-allowed"
                : "text-muted-foreground hover:bg-accent/40 hover:text-foreground"
            )}
          >
            {isActive && !isComingSoon && (
              <motion.div
                layoutId="sidebar-active"
                className="absolute inset-0 rounded-xl bg-accent"
                transition={{ type: "spring", stiffness: 350, damping: 30 }}
              />
            )}
            <span
              className={cn(
                "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-lg transition-transform duration-200",
                isActive && !isComingSoon
                  ? "bg-foreground text-background scale-105 shadow-sm"
                  : isDisabled
                  ? "bg-muted/30 text-muted-foreground/30"
                  : "bg-muted text-muted-foreground group-hover:bg-accent group-hover:text-foreground group-hover:scale-105"
              )}
            >
              <Icon className="size-4" />
            </span>
            <span className="relative z-10 flex-1 truncate h-5 flex items-center">
              {!isComingSoon ? (
                <span>{item.title}</span>
              ) : (
                <>
                  <span className="absolute inset-0 transition-transform duration-300 group-hover:-translate-y-full flex items-center">
                    {item.title}
                  </span>
                  <span className="absolute inset-0 transition-transform duration-300 translate-y-full group-hover:translate-y-0 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-primary">
                    <span className="relative flex h-1.5 w-1.5 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary"></span>
                    </span>
                    Coming Soon
                  </span>
                </>
              )}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarLogout({ className }: { className?: string }) {
  const handleLogout = () => {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("access_token");
    localStorage.removeItem("user");
    window.location.replace("/");
  };

  return (
    <div className={cn("flex shrink-0 justify-center items-center border-t border-border px-4 py-3", className)}>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-full gap-1.5 px-2.5 text-md text-muted-foreground hover:text-foreground cursor-pointer"
        onClick={handleLogout}
      >
        <LogOut className="size-3.5" />
        Log out
      </Button>
    </div>
  );
}

type SidebarProps = {
  className?: string;
  isLockedOut?: boolean;
};

export function Sidebar({ className, isLockedOut }: SidebarProps) {
  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen w-[var(--sidebar-width)] shrink-0 flex-col border-r border-border bg-sidebar-background lg:flex",
        className
      )}
    >
      <div className="flex h-[var(--header-height)] shrink-0 items-center border-b border-border bg-sidebar-background px-5">
        <Logo />
      </div>

      <ScrollArea className="min-h-0 flex-1 py-4">
        <SidebarNav isLockedOut={isLockedOut} />
      </ScrollArea>

      <InfraCostAlert />
      <SidebarChatbot mode="fab" />
      <SidebarLogout />
    </aside>
  );
}

export { SidebarLogout };
