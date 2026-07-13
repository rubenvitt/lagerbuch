"use client";
import { useTransition } from "react";
import { setFlascheAktiv } from "@/actions/sauerstoff";

export function FlascheAktivToggle({ id, aktiv }: { id: string; aktiv: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      className="btn btn-ghost slim"
      disabled={pending}
      onClick={() => start(async () => { await setFlascheAktiv({ id, aktiv: !aktiv }); })}
    >
      {aktiv ? "Deaktivieren" : "Aktivieren"}
    </button>
  );
}
