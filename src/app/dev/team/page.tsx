import { notFound } from "next/navigation";
import { TeamPreview } from "./preview";

export const metadata = { title: "team states", robots: { index: false } };

/** Dev-only: the Team page and the workspace switcher with example data. 404 in production. */
export default function DevTeamPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <TeamPreview />;
}
