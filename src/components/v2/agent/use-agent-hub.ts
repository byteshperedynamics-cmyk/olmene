"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AgentApiError,
  connectGithub,
  disconnectGithub,
  getAgentConfig,
  getAgentJobs,
  registerGithubApp,
  type AgentConnection,
} from "@/lib/agent-client";
import { listJobs } from "@/lib/data";
import { track } from "@/lib/track";

export interface DisconnectResult {
  verified: boolean;
  evidence: Record<string, unknown>;
  manualSteps: string[];
  uninstallUrl: string;
}

/** Shared state + actions for the agent hub and the connect page. Logic unchanged from the v1 hub. */
export function useAgentHub() {
  const [busy, setBusy] = useState<string | null>(null);
  const [disconnectResult, setDisconnectResult] = useState<DisconnectResult | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("registered") === "1") toast.success("GitHub app set up. Connect your account to continue.");
    if (p.get("registered") === "0") toast.error("The GitHub app setup did not finish. Try again.");
    if (p.get("connected") === "1") track("github_connected");
    if (p.get("connected") === "0") {
      const reason = p.get("reason");
      toast.error(
        reason === "not_installed"
          ? "You authorized Olmene but no installation was found. Install the app on your site's repository, then reconnect."
          : "Connecting GitHub did not finish. Try again.",
      );
    }
  }, []);

  const config = useQuery({ queryKey: ["agent-config"], queryFn: getAgentConfig, retry: 1 });
  const jobs = useQuery({ queryKey: ["agent-jobs"], queryFn: getAgentJobs });
  const reports = useQuery({ queryKey: ["jobs"], queryFn: () => listJobs() });

  const activeConnection: AgentConnection | undefined = useMemo(
    () => config.data?.github.connections.find((c) => c.status === "active"),
    [config.data],
  );
  const completedReports = (reports.data ?? []).filter((j) => j.status === "completed");

  async function onRegister() {
    setBusy("register");
    try {
      const { url } = await registerGithubApp();
      window.location.href = url;
    } catch (e) {
      toast.error(e instanceof AgentApiError ? e.message : "Could not start the GitHub app setup.");
      setBusy(null);
    }
  }

  async function onConnect() {
    setBusy("connect");
    track("connect_step_viewed", { step: "github_redirect" });
    try {
      const { url } = await connectGithub();
      window.location.href = url;
    } catch (e) {
      toast.error(e instanceof AgentApiError ? e.message : "Could not start connecting GitHub.");
      setBusy(null);
    }
  }

  async function onDisconnect() {
    if (!activeConnection) return;
    setBusy("disconnect");
    try {
      const res = await disconnectGithub(activeConnection.id);
      if (res.verified) {
        toast.success("Disconnected. GitHub confirmed the access is gone.");
      } else {
        toast.warning("The connection is deleted, but the GitHub app is still installed on your account.", {
          description: "Finish removing it with the steps shown on this page.",
          duration: 12000,
        });
      }
      setDisconnectResult(res);
      await config.refetch();
    } catch (e) {
      toast.error(e instanceof AgentApiError ? e.message : "Could not disconnect. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return {
    busy,
    config,
    jobs,
    activeConnection,
    completedReports,
    disconnectResult,
    onRegister,
    onConnect,
    onDisconnect,
  };
}
