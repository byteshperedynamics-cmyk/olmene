"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";

// Set while a deliberate sign-out navigates away, so the /app/ auth gate
// doesn't race it with its own "you're signed out" redirect.
let leaving = false;
export function isLeaving(): boolean {
  return leaving;
}

/** Session state shared by header + app pages. */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session);
      })
      .finally(() => setLoading(false));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  /**
   * Signs out of this browser (`everywhere`: every device). With `to`, goes
   * there afterwards as a full page load, which also clears cached account
   * data from memory.
   */
  const signOut = useCallback(async (opts?: { to?: string; everywhere?: boolean }) => {
    const supabase = getSupabase();
    if (opts?.to) leaving = true;
    await supabase?.auth.signOut({ scope: opts?.everywhere ? "global" : "local" }).catch(() => {});
    setSession(null);
    if (opts?.to) window.location.replace(opts.to);
  }, []);

  return { session, loading, loggedIn: !!session, signOut };
}
