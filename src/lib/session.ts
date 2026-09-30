"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";

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

  const signOut = useCallback(async () => {
    const supabase = getSupabase();
    await supabase?.auth.signOut();
    setSession(null);
  }, []);

  return { session, loading, loggedIn: !!session, signOut };
}
