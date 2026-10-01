import { notFound } from "next/navigation";
import { AgentRunPreview } from "./preview";

export const metadata = { title: "agent run states", robots: { index: false } };

/** Dev-only: the fix-run screen in every state, with example data. 404 in production. */
export default function DevAgentRunPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <AgentRunPreview />;
}
