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

/** What went wrong on the way back from GitHub (`?connected=0&reason=…`). */
const CONNECT_FAILURE: Record<string, string> = {
  not_installed: "You authorized Olmene, but it isn't installed on a repository yet. Install it on your site's repository, then connect again.",
  bad_state: "That GitHub link expired or was already used. Start again with Connect GitHub.",
  missing_params: "GitHub didn't send the sign-in details back. Start again with Connect GitHub.",
  app_not_configured: "GitHub connections aren't set up yet. Please try again later.",
  callback_failed: "GitHub didn't confirm your installation. Try again in a minute; if it keeps failing, contact support.",
};

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
  const [connectFailure, setConnectFailure] = useState<string | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("registered") === "1") toast.success("GitHub app set up. Connect your account to continue.");
    if (p.get("registered") === "0") toast.error("The GitHub app setup did not finish. Try again.");
    if (p.get("connected") === "1") track("github_connected");
    if (p.get("connected") === "0") {
      const reason = p.get("reason") ?? "";
      setConnectFailure(reason);
      toast.error(CONNECT_FAILURE[reason] ?? "Connecting GitHub did not finish. Try again.");
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
  // GitHub's authorize screen doesn't always offer installation, so when the
  // callback found none, send the user straight to the app's install page.
  const appSlug = config.data?.github.appSlug ?? null;
  const installUrl =
    connectFailure === "not_installed" && appSlug ? `https://github.com/apps/${encodeURIComponent(appSlug)}/installations/new` : null;

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
    installUrl,
    onRegister,
    onConnect,
    onDisconnect,
  };
}
