"use client";

import Link from "next/link";
import { Building2, Check, ChevronsUpDown, UsersRound } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROLE_COPY } from "@/lib/workspace/roles";
import { setActiveWorkspace } from "@/lib/workspace/client";
import type { WorkspaceSummary } from "@/lib/workspace/types";
import { cn } from "@/lib/utils";

function Mark({ ws, size = 22 }: { ws: WorkspaceSummary; size?: number }) {
  const letter = ws.name.trim().charAt(0).toUpperCase() || "W";
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className="grid shrink-0 place-items-center rounded-md border border-rim bg-chip text-[11px] font-semibold text-foreground"
    >
      {ws.kind === "agency" ? <Building2 className="size-3" /> : letter}
    </span>
  );
}

/**
 * Which workspace you're working in: your own account or one you were
 * invited to. Only shown once there's more than one to choose from.
 * Switching reloads into the dashboard, so nothing from the previous
 * workspace stays on screen.
 */
export function WorkspaceSwitcher({ list, current }: { list: WorkspaceSummary[]; current: WorkspaceSummary | null }) {
  if (list.length < 2 || !current) return null;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        aria-label={`Workspace: ${current.name}. Switch workspace`}
        className="o-hit flex h-9 max-w-[11rem] cursor-pointer items-center gap-2 rounded-lg border border-transparent px-2 text-[13.5px] transition-colors hover:border-rim hover:bg-chip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:border-rim data-[state=open]:bg-chip sm:max-w-[14rem]"
      >
        <Mark ws={current} />
        <span className="hidden truncate font-medium sm:inline">{current.name}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={8} className="w-[18rem] rounded-xl p-1.5">
        <DropdownMenuLabel className="px-2 pt-1.5 pb-1 text-[12px] font-normal text-muted-foreground">Workspaces</DropdownMenuLabel>
        {list.map((ws) => {
          const on = ws.ownerId === current.ownerId;
          return (
            <DropdownMenuItem
              key={ws.ownerId}
              onSelect={() => !on && setActiveWorkspace(ws.own ? null : ws.ownerId, { to: "/app/" })}
              aria-current={on ? "true" : undefined}
              className={cn("cursor-pointer gap-2.5 rounded-lg px-2 py-2", on && "bg-chip")}
            >
              <Mark ws={ws} size={28} />
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="truncate text-[14px] font-medium">{ws.name}</span>
                <span className="truncate text-[12px] text-muted-foreground">
                  {ws.own ? "Your account" : `${ROLE_COPY[ws.role].label}${ws.ownerName ? ` · ${ws.ownerName}` : ""}`}
                </span>
              </span>
              {on && <Check className="size-4 shrink-0" aria-hidden />}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="cursor-pointer gap-2.5 rounded-lg px-2 py-2">
          <Link href="/app/team/">
            <UsersRound className="size-4" aria-hidden /> Team and invitations
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
