import { notFound } from "next/navigation";
import { SharePreview } from "./preview";

export const metadata = { title: "share states", robots: { index: false } };

/** Dev-only: the public progress page with example data (?state=new|anon|gone|agency|agency-wl). 404 in production. */
export default function DevSharePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <SharePreview />;
}
