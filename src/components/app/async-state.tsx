"use client";

import { Lock, RotateCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** The parts of a react-query result this needs (a merged pair of queries fits too). */
export interface QueryLike<T> {
  data: T | undefined;
  error: unknown;
  isError: boolean;
  isPending: boolean;
  isFetching: boolean;
  dataUpdatedAt: number;
  refetch: () => unknown;
}

/**
 * One pattern for every list the signed-in app loads (refinement 2026-10-30):
 *
 *   loading  nothing yet          → skeleton rows
 *   failed   request failed, no data → "Couldn't load …" with Retry
 *   denied   401/403              → "You don't have access …"
 *   stale    a refresh failed, older data on screen → the data, plus a note
 *   empty    loaded, nothing in it → the caller's empty state
 *   ready    → the caller's content
 *
 * A failed request never falls through to the empty state: "No sites" must
 * mean there are no sites, not that the database didn't answer.
 */
export function AsyncState<T>({
  query,
  what,
  isEmpty,
  empty,
  skeleton,
  compact = false,
  children,
}: {
  query: QueryLike<T>;
  /** Plural noun for messages: "sites", "fix runs", "activity". */
  what: string;
  isEmpty?: (data: T) => boolean;
  empty?: React.ReactNode;
  /** Shown while loading (defaults to three rows). */
  skeleton?: React.ReactNode;
  /** Tighter messages for side panels. */
  compact?: boolean;
  children: (data: T) => React.ReactNode;
}) {
  const { data, error, isError, isPending } = query;

  if (isPending && data === undefined) {
    return <>{skeleton ?? <SkeletonRows compact={compact} />}</>;
  }
  if (data === undefined) {
    return isDenied(error) ? (
      <DeniedState what={what} compact={compact} />
    ) : (
      <FailedState what={what} compact={compact} error={error} retrying={query.isFetching} onRetry={() => void query.refetch()} />
    );
  }
  return (
    <>
      {isError && <StaleNote what={what} at={query.dataUpdatedAt} retrying={query.isFetching} onRetry={() => void query.refetch()} />}
      {isEmpty?.(data) && empty !== undefined ? empty : children(data)}
    </>
  );
}

export function isDenied(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  return status === 401 || status === 403;
}

export function SkeletonRows({ compact = false, rows = 3 }: { compact?: boolean; rows?: number }) {
  return (
    <div className="grid gap-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={cn("w-full rounded-xl", compact ? "h-10" : "h-20")} />
      ))}
    </div>
  );
}

export function FailedState({
  what,
  compact,
  error,
  retrying,
  onRetry,
}: {
  what: string;
  compact?: boolean;
  error?: unknown;
  retrying?: boolean;
  onRetry?: () => void;
}) {
  const detail = error instanceof Error && error.message && !/fetch|network/i.test(error.message) ? error.message : null;
  return (
    <div role="alert" className={cn("flex items-start gap-3 rounded-xl border border-tel-rose/30 bg-tel-rose/[0.05]", compact ? "px-4 py-3" : "px-5 py-4")}>
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-tel-rose" aria-hidden />
      <div className="grid min-w-0 flex-1 gap-1">
        <p className="text-[14px] font-medium">Couldn&apos;t load {what}</p>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          This is a loading problem, not an empty list. Your data is safe.{detail ? ` (${detail})` : ""}
        </p>
      </div>
      {onRetry && (
        <Button size="sm" variant="hairline" onClick={onRetry} disabled={retrying} className="shrink-0">
          <RotateCw className={cn("size-3.5", retrying && "animate-spin")} aria-hidden /> {retrying ? "Retrying…" : "Retry"}
        </Button>
      )}
    </div>
  );
}

export function DeniedState({ what, compact }: { what: string; compact?: boolean }) {
  return (
    <div role="status" className={cn("flex items-start gap-3 rounded-xl border border-rim bg-chip/60", compact ? "px-4 py-3" : "px-5 py-4")}>
      <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="grid gap-1">
        <p className="text-[14px] font-medium">You don&apos;t have access to {what} here</p>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Your role in this workspace doesn&apos;t include them, or your sign-in has expired. Ask a workspace admin, or sign in again.
        </p>
      </div>
    </div>
  );
}

function StaleNote({ what, at, retrying, onRetry }: { what: string; at: number; retrying: boolean; onRetry: () => void }) {
  const time = at ? new Date(at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : null;
  return (
    <p role="status" className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-tel-amber/35 bg-tel-amber/[0.06] px-3 py-2 text-[12.5px]">
      <TriangleAlert className="size-3.5 shrink-0 text-tel-amber" aria-hidden />
      <span className="min-w-0 flex-1">
        Couldn&apos;t refresh {what}. Showing what loaded{time ? ` at ${time}` : " earlier"}.
      </span>
      <button type="button" onClick={onRetry} disabled={retrying} className="o-hit relative font-medium underline underline-offset-4 disabled:opacity-60">
        {retrying ? "Retrying…" : "Retry"}
      </button>
    </p>
  );
}

/** A quiet empty state: what this area is for, and the one next step. */
export function EmptyState({ title, body, action, compact }: { title: string; body: React.ReactNode; action?: React.ReactNode; compact?: boolean }) {
  return (
    <div className={cn("rounded-xl border border-dashed border-line-strong text-center", compact ? "px-4 py-5" : "px-6 py-9")}>
      <p className="text-[14.5px] font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-[13.5px] leading-relaxed text-muted-foreground">{body}</p>
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
