"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";

export default function LoginPage() {
  const { t } = useT();
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    // Keep the callback URL exact (no query string) so it matches Supabase's redirect allow-list.
    const next = new URLSearchParams(window.location.search).get("next") ?? "/";
    try {
      localStorage.setItem("sharing:next", next);
    } catch {}
    const { error } = await supabase().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setError(error.message);
  }

  return (
    <main className="safe-top flex min-h-dvh flex-col items-center justify-center bg-header px-8 text-center">
      <div className="relative mb-8 h-40 w-40">
        <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-accent" />
        <div className="absolute bottom-0 left-0 h-14 w-14 rounded-full bg-accent-dim" />
      </div>
      <h1 className="text-4xl font-bold">Sharing</h1>
      <p className="mt-2 max-w-xs text-muted">{t("Split expenses with your partner, friends or on your next trip.")}</p>
      <button
        onClick={signIn}
        className="mt-10 w-full max-w-xs rounded-full bg-white py-3.5 font-semibold text-black active:opacity-80"
      >
        {t("Continue with Google")}
      </button>
      {error && <p className="mt-4 text-sm text-bad">{error}</p>}
    </main>
  );
}
