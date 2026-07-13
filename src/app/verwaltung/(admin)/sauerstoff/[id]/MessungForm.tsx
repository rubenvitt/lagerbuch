"use client";
import { useState, useTransition } from "react";
import { messungErfassen } from "@/actions/sauerstoff";

export function MessungForm({ flascheId }: { flascheId: string }) {
  const [druck, setDruck] = useState("");
  const [kommentar, setKommentar] = useState("");
  const [pending, start] = useTransition();

  function submit() {
    const d = Number(druck);
    if (druck.trim() === "" || !Number.isFinite(d) || d < 0) return;
    start(async () => {
      await messungErfassen({ flascheId, druckBar: d, kommentar: kommentar.trim() || undefined });
      setDruck("");
      setKommentar("");
    });
  }

  return (
    <div className="card cardpad" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <input className="input" style={{ width: 140 }} type="number" min={0} placeholder="Druck (bar)" value={druck} onChange={(e) => setDruck(e.target.value)} />
      <input className="input" placeholder="Kommentar (optional)" value={kommentar} onChange={(e) => setKommentar(e.target.value)} style={{ minWidth: 180 }} />
      <button className="btn btn-rot" disabled={pending || druck.trim() === ""} onClick={submit}>Erfassen</button>
    </div>
  );
}
