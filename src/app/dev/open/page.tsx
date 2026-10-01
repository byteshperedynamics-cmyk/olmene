import { notFound } from "next/navigation";
import { OpenPreview } from "./preview";

export const metadata = { title: "open metrics preview", robots: { index: false } };

/** Dev-only: /open with example numbers. 404 in production. */
export default function DevOpenPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <OpenPreview />;
}
