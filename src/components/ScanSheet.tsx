"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import jsQR from "jsqr";
import { useT } from "@/lib/i18n";
import { Sheet } from "./ui";

export function ScanSheet({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | undefined;
    let raf = 0;
    let stopped = false;
    const canvas = document.createElement("canvas");

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      } catch {
        setError(t("Camera access was denied. You can also open the invite link directly."));
        return;
      }
      const v = video.current!;
      v.srcObject = stream;
      await v.play();
      const tick = () => {
        if (stopped) return;
        if (v.readyState === v.HAVE_ENOUGH_DATA) {
          canvas.width = v.videoWidth;
          canvas.height = v.videoHeight;
          const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
          ctx.drawImage(v, 0, 0);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const hit = jsQR(img.data, img.width, img.height);
          const m = hit?.data.match(/\/join\/([A-Za-z0-9]+)/);
          if (m) {
            stopped = true;
            router.push(`/join/${m[1]}`);
            return;
          }
        }
        raf = requestAnimationFrame(tick);
      };
      tick();
    }
    void start();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  return (
    <Sheet title={t("Scan QR code")} onClose={onClose}>
      <div className="p-4">
        {error ? <p className="text-bad">{error}</p> : <video ref={video} playsInline muted className="aspect-square w-full rounded-2xl bg-black object-cover" />}
        <p className="mt-3 text-center text-sm text-muted">{t("Point the camera at the QR code shown in a group's invite screen.")}</p>
      </div>
    </Sheet>
  );
}
