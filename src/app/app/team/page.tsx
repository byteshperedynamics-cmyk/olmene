"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/v2/atoms";
import { TeamView } from "@/components/workspace/team-view";
import { activeWorkspace, getWorkspace, setActiveWorkspace } from "@/lib/workspace/client";
import { ROLE_COPY } from "@/lib/workspace/roles";
import type { WorkspaceView } from "@/lib/workspace/types";

/** Team: who's in this workspace, their roles, invitations, and leaving. */
export default function TeamPage() {
  const qc = useQueryClient();
  const key = ["workspace", activeWorkspace() ?? "own"];
  const q = useQuery({ queryKey: key, queryFn: getWorkspace, retry: 1 });
  const view = q.data;

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <header className="grid gap-2">
        <Eyebrow>Team</Eyebrow>
        {view ? (
          <>
            <h1 className="o-display text-[32px] leading-tight">{view.name}</h1>
            <p className="max-w-xl text-[15px] text-muted-foreground">
              Everyone here works on the same plan, sites, reports and fixes.
              {view.role !== "owner" ? ` You're ${view.role === "admin" ? "an" : "a"} ${ROLE_COPY[view.role].label.toLowerCase()}.` : ""}
            </p>
          </>
        ) : (
          <Skeleton className="h-10 w-64 rounded-lg" />
        )}
      </header>

      {q.isError ? (
        <section className="grid gap-3 rounded-2xl border bg-card p-6">
          <p className="text-[14px]">{q.error instanceof Error ? q.error.message : "Couldn't load the team."}</p>
          <div className="flex gap-2">
            <Button variant="hairline" size="sm" onClick={() => void q.refetch()}>
              Try again
            </Button>
            {activeWorkspace() && (
              <Button variant="ghost" size="sm" onClick={() => setActiveWorkspace(null, { to: "/app/team/" })}>
                Back to your own account
              </Button>
            )}
          </div>
        </section>
      ) : !view ? (
        <div className="grid gap-6">
          <Skeleton className="h-64 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      ) : (
        <TeamView
          view={view}
          onChanged={(next?: WorkspaceView) => {
            if (next) qc.setQueryData(key, next);
            else void qc.invalidateQueries({ queryKey: ["workspace"] });
            void qc.invalidateQueries({ queryKey: ["workspaces"] });
          }}
          onLeft={() => setActiveWorkspace(null, { to: "/app/" })}
        />
      )}
    </div>
  );
}
