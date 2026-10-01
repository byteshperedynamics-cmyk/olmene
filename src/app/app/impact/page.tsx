"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AgentApiError, connectSearchConsole, getMeasureOverview } from "@/lib/agent-client";
import { track } from "@/lib/track";
import { Eyebrow } from "@/components/v2/atoms";
import { Flower } from "@/components/v2/flower";
import { ImpactView } from "@/components/v2/measure/impact-view";

const REASONS: Record<string, string> = {
  denied: "Search Console access was not granted.",
  bad_state: "That link expired. Start the connection again.",
  no_property: "None of your Search Console properties matches the site you analyzed.",
  exchange_failed: "Google didn't complete the connection. Try again.",
  not_configured: "Search Console connection is not configured on this deployment.",
};

/** Impact dashboard (brief §5C). */
export default function ImpactPage() {
  const [connecting, setConnecting] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["measure-overview"], queryFn: getMeasureOverview, retry: 1 });

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("connected") === "1") {
      track("gsc_connected");
      toast.success("Search Console connected. The first data arrives within a day.");
    }
    if (p.get("connected") === "0") toast.error(REASONS[p.get("reason") ?? ""] ?? "Connecting Search Console did not finish.");
  }, []);

  async function onConnect() {
    setConnecting(true);
    try {
      const { url } = await connectSearchConsole();
      window.location.href = url;
    } catch (e) {
      toast.error(e instanceof AgentApiError ? e.message : "Could not start connecting Search Console.");
      setConnecting(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <header className="grid gap-2">
        <Eyebrow>Impact</Eyebrow>
        <h1 className="o-display text-[32px] leading-tight">What your fixes changed</h1>
      </header>
      {isLoading ? (
        <div className="grid place-items-center py-24">
          <Flower size={44} variant="breathe" />
        </div>
      ) : error || !data ? (
        <div className="grid justify-items-center gap-3 py-20 text-center">
          <p className="o-display text-2xl">Could not load your impact data</p>
          <p className="text-[14px] text-muted-foreground">Check your connection and try again.</p>
          <button type="button" onClick={() => refetch()} className="text-[14px] text-primary underline underline-offset-4">
            Try again
          </button>
        </div>
      ) : (
        <ImpactView data={data} onConnect={onConnect} connecting={connecting} />
      )}
    </div>
  );
}
