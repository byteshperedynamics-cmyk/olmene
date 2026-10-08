"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { featureAgentEnabled } from "@/lib/agent-client";
import { track } from "@/lib/track";
import { Flower } from "@/components/v2/flower";
import { ConnectPanel } from "@/components/v2/agent/connect-panel";
import { StateMessage } from "@/components/v2/agent/job-view";
import { useAgentHub } from "@/components/v2/agent/use-agent-hub";

/** Connect flow (brief §5D). Once GitHub is connected, continues to the fix runs hub. */
export default function ConnectPage() {
  const router = useRouter();
  const hub = useAgentHub();
  const connected = !!hub.activeConnection;

  useEffect(() => {
    track("connect_step_viewed", { step: "page" });
  }, []);
  useEffect(() => {
    if (connected) router.replace("/app/agent/");
  }, [connected, router]);

  if (!featureAgentEnabled()) {
    return (
      <StateMessage
        title="The fix agent isn't switched on yet"
        body="Connecting GitHub becomes available when fix runs are enabled."
        action={
          <Button asChild variant="hairline">
            <Link href="/app/">Back to analyses</Link>
          </Button>
        }
      />
    );
  }

  if (hub.config.isLoading || !hub.config.data) {
    return (
      <div className="grid place-items-center py-28">
        <Flower size={44} variant="breathe" />
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <div className="grid gap-2">
        <h1 className="o-display text-[32px] leading-tight">Connect Olmene</h1>
        <p className="max-w-xl text-[15px] text-muted-foreground">
          Two steps and you can approve your first fix. You stay in control of every change.
        </p>
      </div>
      <ConnectPanel
        hasScan={hub.completedReports.length > 0}
        githubConfigured={hub.config.data.github.configured}
        canRegister={hub.config.data.github.canRegister ?? false}
        githubConnected={connected}
        killSwitch={hub.config.data.killSwitch}
        busy={hub.busy}
        onRegister={hub.onRegister}
        onConnect={hub.onConnect}
        installUrl={hub.installUrl}
      />
    </div>
  );
}
