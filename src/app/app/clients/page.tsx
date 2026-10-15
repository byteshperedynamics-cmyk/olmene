"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Eyebrow } from "@/components/v2/atoms";
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
      <header className="grid gap-2">
        <Eyebrow>Clients</Eyebrow>
        <h1 className="o-display text-[32px] leading-tight">Clients</h1>
        <p className="max-w-2xl text-[15px] text-muted-foreground">
          Group sites by client, and give each client a page with their sites&apos; progress, under your name.
        </p>
      </header>

      {q.isError ? (
        <section className="grid gap-3 rounded-2xl border bg-card p-6">
          <p className="text-[14px]">{q.error instanceof Error ? q.error.message : "Couldn't load your clients."}</p>
          <div>
            <Button variant="hairline" size="sm" onClick={() => void q.refetch()}>
              Try again
            </Button>
          </div>
        </section>
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
