"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { LogOut, User } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUserContext } from "@/features/auth/context/user-context";
import { useBrand } from "@/components/providers/brand-provider";

import { cn } from "@/lib/utils";

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

type UserMenuProps = {
  className?: string;
};

export function UserMenu({ className }: UserMenuProps) {
  const router = useRouter();
  const { user } = useUserContext();
  const { domain } = useBrand();
  
  const fullName = user
    ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.name || user.email?.split("@")[0] || "User"
    : "User";
  const email = user?.email || "";

  const userInfo = {
    name: fullName.trim(),
    email: email,
  };

  const handleLogout = () => {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("access_token");
    localStorage.removeItem("user");
    window.location.replace("/");
  };

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn("relative size-10 rounded-full p-0", className)}
        >
          <Avatar className="size-10">
            <AvatarFallback className="bg-muted text-foreground">
              {getInitials(userInfo.name || "User")}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{userInfo.name}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {userInfo.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={user?.creditBalance?.creditsRemaining !== undefined && user.creditBalance.creditsRemaining <= 0 ? "/dashboard/billing" : "/dashboard"}>
            <User className="size-4" />
            {user?.creditBalance?.creditsRemaining !== undefined && user.creditBalance.creditsRemaining <= 0 ? "Billing" : "Profile"}
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-red-400 focus:text-red-400 focus:bg-red-500/10">
          <LogOut className="size-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
