"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";

function Callback() {
  const { t } = useT();
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = params.get("code");
    let next = "/";
    try {
      next = localStorage.getItem("sharing:next") ?? "/";
      localStorage.removeItem("sharing:next");
    } catch {}
    const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
    if (!code) {
      router.replace("/login");
      return;
    }
    supabase()
      .auth.exchangeCodeForSession(code)
      .then(({ error }) => (error ? setError(error.message) : router.replace(safeNext)));
  }, [params, router]);

  return <p className="p-8 text-center text-muted">{error ?? t("Signing you in…")}</p>;
}

export default function CallbackPage() {
  return (
    <Suspense>
      <Callback />
    </Suspense>
  );
}
