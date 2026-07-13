"use client";
import { useTransition } from "react";
import { setGeraetAktiv } from "@/actions/bz";

export function GeraetAktivToggle({ id, aktiv }: { id: string; aktiv: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      className="btn btn-ghost slim"
      disabled={pending}
      onClick={() => start(async () => { await setGeraetAktiv({ id, aktiv: !aktiv }); })}
    >
      {aktiv ? "Deaktivieren" : "Aktivieren"}
    </button>
  );
}
