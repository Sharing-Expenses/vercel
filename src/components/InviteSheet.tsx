"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useT } from "@/lib/i18n";
import { Sheet } from "./ui";

export function InviteSheet({ code, name, onClose }: { code: string; name: string; onClose: () => void }) {
  const { t } = useT();
  const [qr, setQr] = useState<string>();
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/join/${code}`;

  useEffect(() => {
    QRCode.toDataURL(link, { margin: 1, width: 480, color: { dark: "#000000", light: "#ffffff" } }).then(setQr);
  }, [link]);

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: t("Join {name} on Sharing", { name }), url: link });
        return;
      } catch {
        /* cancelled */
      }
    }
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Sheet title={t("Invite to {name}", { name })} onClose={onClose}>
      <div className="flex flex-col items-center gap-5 p-6">
        <p className="text-center text-muted">{t("Ask your friend to scan this code from Sharing, or send them the link.")}</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {qr ? <img src={qr} alt="Invite QR code" className="h-64 w-64 rounded-2xl bg-white p-2" /> : <div className="h-64 w-64" />}
        <button onClick={share} className="w-full rounded-xl bg-accent py-3.5 text-lg font-semibold text-black">{copied ? t("Link copied ✓") : t("Share link")}</button>
        <p className="break-all text-center text-xs text-muted">{link}</p>
      </div>
    </Sheet>
  );
}
