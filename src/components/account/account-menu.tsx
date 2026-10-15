"use client";

import Link from "next/link";
import { CreditCard, LayoutDashboard, LifeBuoy, LogOut, Share2, UserRound } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SUPPORT_EMAIL } from "@/lib/config";
import type { Identity } from "@/lib/account-client";
import { UserAvatar } from "./user-avatar";

export interface AccountMenuLabels {
  menu: string;
  dashboard: string;
  account: string;
  share: string;
  billing: string;
  help: string;
  signOut: string;
  addName: string;
}

const EN: AccountMenuLabels = {
  menu: "Account menu",
  dashboard: "Dashboard",
  account: "Account settings",
  share: "Share your progress",
  billing: "Plan and billing",
  help: "Help and support",
  signOut: "Sign out",
  addName: "Add your name",
};

/**
 * The signed-in person in the header: their picture opens a menu with who
 * they are, the account pages and sign out. Used by both headers; the
 * marketing header passes translated labels and the dashboard link.
 */
export function AccountMenu({
  identity,
  onSignOut,
  labels = EN,
  showDashboard = false,
}: {
  identity: Identity;
  onSignOut: () => void;
  labels?: AccountMenuLabels;
  showDashboard?: boolean;
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        aria-label={labels.menu}
        className="o-hit relative grid size-9 cursor-pointer place-items-center rounded-full transition-transform hover:scale-[1.04] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[state=open]:ring-2 data-[state=open]:ring-ring/60"
      >
        <UserAvatar src={identity.avatarUrl} initials={identity.initials} size={32} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={10} className="w-[17rem] rounded-xl p-1.5">
        <DropdownMenuLabel className="flex items-center gap-3 px-2 py-2.5 font-normal">
          <UserAvatar src={identity.avatarUrl} initials={identity.initials} size={40} />
          <span className="grid min-w-0 gap-0.5">
            {identity.name ? (
              <span className="truncate text-[14px] font-medium text-foreground">{identity.name}</span>
            ) : (
              <Link href="/app/account/#profile" className="truncate text-[14px] font-medium text-foreground underline-offset-4 hover:underline">
                {labels.addName}
              </Link>
            )}
            <span className="truncate text-[12.5px] text-muted-foreground" dir="ltr">
              {identity.email}
            </span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {showDashboard && (
          <DropdownMenuItem asChild className="cursor-pointer gap-2.5 rounded-lg px-2 py-2">
            <Link href="/app/">
              <LayoutDashboard className="size-4" aria-hidden /> {labels.dashboard}
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild className="cursor-pointer gap-2.5 rounded-lg px-2 py-2">
          <Link href="/app/account/">
            <UserRound className="size-4" aria-hidden /> {labels.account}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="cursor-pointer gap-2.5 rounded-lg px-2 py-2">
          <Link href="/app/account/#progress">
            <Share2 className="size-4" aria-hidden /> {labels.share}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="cursor-pointer gap-2.5 rounded-lg px-2 py-2">
          <Link href="/app/billing/">
            <CreditCard className="size-4" aria-hidden /> {labels.billing}
          </Link>
        </DropdownMenuItem>
        {SUPPORT_EMAIL && (
          <DropdownMenuItem asChild className="cursor-pointer gap-2.5 rounded-lg px-2 py-2">
            <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Olmene help")}`}>
              <LifeBuoy className="size-4" aria-hidden /> {labels.help}
            </a>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onSignOut} className="cursor-pointer gap-2.5 rounded-lg px-2 py-2">
          <LogOut className="size-4" aria-hidden /> {labels.signOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
