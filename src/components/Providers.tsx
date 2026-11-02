"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { sync } from "@/lib/sync";
import { useLang } from "@/lib/i18n";

type AuthState = { session: Session | null; loading: boolean };
const AuthContext = createContext<AuthState>({ session: null, loading: true });
export const useAuth = () => useContext(AuthContext);

export function Providers({ children }: { children: React.ReactNode }) {
  const lang = useLang();
  const [state, setState] = useState<AuthState>({ session: null, loading: true });

  useEffect(() => {
    const sb = supabase();
    // getSession reads the persisted session, so it also works offline.
    sb.auth.getSession().then(({ data }) => setState({ session: data.session, loading: false }));
    const { data } = sb.auth.onAuthStateChange((_e, session) => setState({ session, loading: false }));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    }
  }, []);

  const signedIn = !!state.session;
  useEffect(() => {
    if (!signedIn) return;
    void sync();
    const trigger = () => void sync();
    const onVisible = () => document.visibilityState === "visible" && trigger();
    window.addEventListener("online", trigger);
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(trigger, 30_000);
    return () => {
      window.removeEventListener("online", trigger);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [signedIn]);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
