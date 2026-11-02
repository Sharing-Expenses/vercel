"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/Providers";
import { sync } from "@/lib/sync";
import { useT } from "@/lib/i18n";

type Preview = { id: string; name: string; member_count: number };
type Unclaimed = { id: string; name: string };

export default function JoinPage() {
  const { t } = useT();
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const { session, loading } = useAuth();
  const [preview, setPreview] = useState<Preview | null | undefined>(undefined);
  const [unclaimed, setUnclaimed] = useState<Unclaimed[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace(`/login?next=${encodeURIComponent(`/join/${code}`)}`);
      return;
    }
    const sb = supabase();
    sb.rpc("group_preview", { p_code: code }).then(({ data }) => setPreview(data?.[0] ?? null));
    sb.rpc("unclaimed_members", { p_code: code }).then(({ data }) => setUnclaimed(data ?? []));
  }, [loading, session, code, router]);

  async function join(claim: string | null) {
    setBusy(true);
    const { data, error } = await supabase().rpc("join_group", { p_code: code, p_claim_member: claim });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    await sync();
    localStorage.setItem("sharing:group", data as string);
    router.replace("/");
  }

  return (
    <main className="safe-top flex min-h-dvh flex-col items-center justify-center bg-header px-8 text-center">
      {preview === undefined ? (
        <p className="text-muted">{t("Loading invite…")}</p>
      ) : preview === null ? (
        <p>{t("This invite link is not valid anymore.")}</p>
      ) : (
        <>
          <p className="text-muted">{t("You've been invited to")}</p>
          <h1 className="mt-1 text-3xl font-bold">{preview.name}</h1>
          <p className="mt-1 text-sm text-muted">{t("{n} member(s)", { n: preview.member_count })}</p>
          {unclaimed.length > 0 && (
            <div className="mt-8 w-full max-w-xs">
              <p className="mb-2 text-sm text-muted">{t("Are you one of these people?")}</p>
              {unclaimed.map((m) => (
                <button
                  key={m.id}
                  disabled={busy}
                  onClick={() => join(m.id)}
                  className="mb-2 w-full rounded-xl bg-surface py-3 active:bg-surface2"
                >
                  {t("I'm {name}", { name: m.name })}
                </button>
              ))}
            </div>
          )}
          <button
            disabled={busy}
            onClick={() => join(null)}
            className="mt-6 w-full max-w-xs rounded-full bg-accent py-3.5 font-semibold text-black active:opacity-80"
          >
            {unclaimed.length ? t("Join as a new member") : t("Join group")}
          </button>
          {error && <p className="mt-4 text-sm text-bad">{error}</p>}
        </>
      )}
    </main>
  );
}
