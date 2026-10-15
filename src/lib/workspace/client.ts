"use client";

/**
 * Workspaces in the browser: which one you're working in (remembered per
 * browser), the header every Worker call carries, and the Team page's calls.
 *
 * Switching reloads the page, so nothing from the previous workspace stays
 * on screen or in the query cache. Other tabs follow the switch.
 */

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";
import { WORKSPACE_HEADER, isUuid, type InvitableRole } from "./roles";
import type { InvitePreview, WorkspaceInvite, WorkspaceKind, WorkspaceSummary, WorkspaceView } from "./types";

const KEY = "olm_ws";

/** The workspace owner you're working for, or null for your own account. */
export function activeWorkspace(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(KEY);
    return isUuid(v) ? v : null;
  } catch {
    return null;
  }
}

/** Switch workspace (null = your own account). Reloads into `to` unless told not to. */
export function setActiveWorkspace(ownerId: string | null, opts: { to?: string; reload?: boolean } = {}): void {
  try {
    if (ownerId) window.localStorage.setItem(KEY, ownerId);
    else window.localStorage.removeItem(KEY);
  } catch {
    // storage blocked (private mode): the switch lasts for this page only
  }
  if (opts.reload === false) return;
  window.location.assign(opts.to ?? window.location.pathname + window.location.search);
}

/** Header for Worker calls; empty when you're in your own account. */
export function workspaceHeader(): Record<string, string> {
  const ws = activeWorkspace();
  return ws ? { [WORKSPACE_HEADER]: ws } : {};
}

/** Whose rows a direct database read should show: the active workspace's owner, or you. */
export async function scopeOwnerId(): Promise<string | null> {
  const ws = activeWorkspace();
  if (ws) return ws;
  const session = (await getSupabase()?.auth.getSession())?.data.session;
  return session?.user.id ?? null;
}

/** Another tab switched workspace: follow it rather than mix two workspaces. */
export function useFollowWorkspaceSwitches(): void {
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) window.location.reload();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
}

// ── Calls ──────────────────────────────────────────────────────────────────

export class TeamApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "TeamApiError";
  }
}

/**
 * A Worker API call as the signed-in person, in the workspace they're in.
 * `body` goes as JSON; a File or Blob goes as it is, with its own type.
 * Errors come back as TeamApiError with the server's message.
 */
export async function apiCall<T>(method: string, path: string, body?: unknown, opts: { auth?: boolean } = {}): Promise<T> {
  const session = opts.auth === false ? null : (await getSupabase()?.auth.getSession())?.data.session;
  const raw = typeof Blob !== "undefined" && body instanceof Blob ? body : null;
  const res = await fetch(path, {
    method,
    headers: {
      ...(raw ? { "Content-Type": raw.type || "application/octet-stream" } : body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...(opts.auth === false ? {} : workspaceHeader()),
    },
    body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } } | null)?.error;
    throw new TeamApiError(res.status, err?.code ?? "request_failed", err?.message ?? "Something went wrong. Try again in a moment.");
  }
  return data as T;
}

export const listWorkspaces = () => apiCall<{ workspaces: WorkspaceSummary[] }>("GET", "/api/workspaces/").then((r) => r.workspaces);
export const getWorkspace = () => apiCall<{ workspace: WorkspaceView }>("GET", "/api/workspace/").then((r) => r.workspace);
export const updateWorkspace = (patch: { name?: string; kind?: WorkspaceKind }) =>
  apiCall<{ workspace: WorkspaceView }>("PATCH", "/api/workspace/", patch).then((r) => r.workspace);
export const inviteToWorkspace = (email: string, role: InvitableRole) =>
  apiCall<{ invite: WorkspaceInvite; link: string; emailed: boolean }>("POST", "/api/workspace/invites/", { email, role });
export const revokeInvite = (id: string) => apiCall<{ ok: true }>("DELETE", `/api/workspace/invites/${encodeURIComponent(id)}/`);
export const changeMemberRole = (userId: string, role: InvitableRole) =>
  apiCall<{ ok: true }>("PATCH", `/api/workspace/members/${encodeURIComponent(userId)}/`, { role });
export const removeMember = (userId: string) => apiCall<{ ok: true }>("DELETE", `/api/workspace/members/${encodeURIComponent(userId)}/`);
export const previewInvite = (token: string) =>
  apiCall<{ invite: InvitePreview }>("GET", `/api/invites/?t=${encodeURIComponent(token)}`, undefined, { auth: false }).then((r) => r.invite);
export const acceptInvite = (token: string) => apiCall<{ workspace: WorkspaceSummary }>("POST", "/api/invites/", { token }).then((r) => r.workspace);

/**
 * Your workspaces and the one you're in. A remembered workspace you've since
 * left (or been removed from) falls back to your own account.
 */
export function useWorkspaces(session: Session | null) {
  const q = useQuery({ queryKey: ["workspaces", session?.user.id ?? null], queryFn: listWorkspaces, enabled: !!session, staleTime: 60_000, retry: 1 });
  const active = activeWorkspace();
  const list = q.data ?? null;
  const current = list ? (list.find((w) => (active ? w.ownerId === active : w.own)) ?? null) : null;
  useEffect(() => {
    if (list && active && !list.some((w) => w.ownerId === active)) setActiveWorkspace(null);
  }, [list, active]);
  return { list, current, loading: q.isLoading, refetch: q.refetch };
}
