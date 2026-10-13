"use client";

import { ThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      {/* Light or dark follows the system setting (Apple HIG, dark-mode.md: no
          app-specific appearance switch). New storage key, so a choice saved by
          the old toggle doesn't pin a visitor to one appearance. */}
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="olmene-appearance" disableTransitionOnChange>
        {children}
        <Toaster position="top-center" richColors closeButton />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
