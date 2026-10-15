import { notFound } from "next/navigation";
import { AccountPreview } from "./preview";

export const metadata = { title: "account states", robots: { index: false } };

/** Dev-only: the account page, welcome and share dialogs with example data. 404 in production. */
export default function DevAccountPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <AccountPreview />;
}
