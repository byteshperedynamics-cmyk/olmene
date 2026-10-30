"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { DeniedState, FailedState, isDenied } from "@/components/app/async-state";
import { ClientsScreen } from "@/components/agency/clients-view";
import { getClients } from "@/lib/agency/client";
import type { ClientsView } from "@/lib/agency/types";
import { activeWorkspace } from "@/lib/workspace/client";

/** Clients (agency workspaces): clients and their sites, client page links, branding. */
export default function ClientsPage() {
  const qc = useQueryClient();
  const key = ["clients", activeWorkspace() ?? "own"];
  const q = useQuery({ queryKey: key, queryFn: getClients, retry: 1 });
  const view = q.data;

  return (
    <div className="mx-auto grid max-w-6xl gap-8">
      <header className="grid gap-1">
        <h1 className="o-display text-[28px] leading-tight">Clients</h1>
        <p className="max-w-2xl text-[14px] text-muted-foreground">
          Group sites by client, and give each client a page with their sites&apos; progress, under your name.
        </p>
      </header>

      {q.isError && !view ? (
        isDenied(q.error) ? (
          <DeniedState what="clients" />
        ) : (
          <FailedState what="clients" error={q.error} retrying={q.isFetching} onRetry={() => void q.refetch()} />
        )
      ) : !view ? (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid gap-4">
            <Skeleton className="h-8 w-40 rounded-lg" />
            <Skeleton className="h-72 w-full rounded-2xl" />
          </div>
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      ) : (
        <ClientsScreen
          view={view}
          onView={(next: ClientsView) => {
            qc.setQueryData(key, next);
            // Sites moved between clients: other screens that list sites refresh too.
            void qc.invalidateQueries({ queryKey: ["sites"] });
          }}
          onKindChanged={() => {
            void q.refetch();
            void qc.invalidateQueries({ queryKey: ["workspaces"] });
            void qc.invalidateQueries({ queryKey: ["workspace"] });
          }}
        />
      )}
    </div>
  );
}
