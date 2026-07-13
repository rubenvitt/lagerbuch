"use client";
import { useTransition } from "react";
import { setFahrzeugAktiv } from "@/actions/fahrzeuge";

export function FahrzeugAktivToggle({ id, aktiv }: { id: string; aktiv: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      className="btn btn-ghost slim"
      disabled={pending}
      onClick={() => start(async () => { await setFahrzeugAktiv({ id, aktiv: !aktiv }); })}
    >
      {aktiv ? "Deaktivieren" : "Aktivieren"}
    </button>
  );
}
