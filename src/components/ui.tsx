"use client";

import { useEffect } from "react";
import type { Member } from "@/lib/db";
import { useT } from "@/lib/i18n";

export function Sheet({
  title,
  onClose,
  right,
  children,
}: {
  title: string;
  onClose: () => void;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { t } = useT();
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-black/60 pt-10" onClick={onClose}>
      <div
        className="safe-bottom mt-auto flex max-h-full min-h-[60%] w-full flex-col overflow-hidden rounded-t-[2rem] bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
          <button onClick={onClose} aria-label={t("Close")} className="h-9 w-9 rounded-full bg-surface2 text-lg">
            ✕
          </button>
          <h2 className="text-lg font-medium">{title}</h2>
          <div className="min-w-9 text-right">{right}</div>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between bg-black px-4 py-3 text-sm text-muted">
      <span>{children}</span>
      {right}
    </div>
  );
}

export function Avatar({ member, size = 40 }: { member?: Pick<Member, "name" | "avatar_url">; size?: number }) {
  const style = { width: size, height: size, fontSize: size * 0.42 };
  if (member?.avatar_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={member.avatar_url} alt="" referrerPolicy="no-referrer" style={style} className="rounded-full object-cover" />;
  }
  return (
    <span style={style} className="flex items-center justify-center rounded-full bg-accent-dim font-semibold text-black">
      {(member?.name ?? "?").slice(0, 1).toUpperCase()}
    </span>
  );
}

export function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`w-full rounded-xl bg-accent py-3.5 text-lg font-semibold text-black active:opacity-80 disabled:opacity-40 ${props.className ?? ""}`}
    />
  );
}
