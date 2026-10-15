import type { Metadata } from "next";

// The link carries a one-person token: keep it out of search and out of
// Referer headers.
export const metadata: Metadata = {
  title: "Join a workspace",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
