"use client";

import { useQuery } from "@tanstack/react-query";

import type { PublicStats } from "./public-stats-types";

export type { PublicStats };

async function fetchStats(): Promise<PublicStats | null> {
  try {
    const res = await fetch("/api/public/stats/");
    if (!res.ok) return null;
    return (await res.json()) as PublicStats;
  } catch {
    return null;
  }
}

/** Live public stats; null while loading or when unavailable (callers keep their fallback). */
export function usePublicStats() {
  return useQuery({ queryKey: ["public-stats"], queryFn: fetchStats, staleTime: 5 * 60_000, retry: 0 });
}
