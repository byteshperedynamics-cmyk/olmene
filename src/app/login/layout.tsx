import type { Metadata } from "next";

// The page is a client component (it sets the translated title after load);
// this gives the server-rendered HTML its own title instead of the homepage's.
export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Olmene with Google or a one-click email link. Your first sign-in creates your account.",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
