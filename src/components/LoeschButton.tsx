"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { LoeschDialog } from "@/components/LoeschDialog";
import type { ElementArt } from "@/lib/loeschen";

type Props = {
  art: ElementArt;
  id: string;
  name: string;
  typLabel: string;
  deaktivierenLabel?: string;
  /** Ziel nach erfolgreichem Löschen (z. B. zurück zur Liste). Ohne: nur refresh. */
  redirectTo?: string;
  /** Nur Icon statt Text-Button (für dichte Tabellenzeilen). */
  iconOnly?: boolean;
  className?: string;
  label?: string;
};

export function LoeschButton({
  art,
  id,
  name,
  typLabel,
  deaktivierenLabel,
  redirectTo,
  iconOnly = false,
  className,
  label = "Löschen",
}: Props) {
  const router = useRouter();
  const [offen, setOffen] = useState(false);

  function onDone() {
    setOffen(false);
    if (redirectTo) router.push(redirectTo);
    router.refresh();
  }

  return (
    <>
      {iconOnly ? (
        <button
          className={className ?? "btn btn-ghost slim"}
          style={{ flex: "none", width: "auto" }}
          aria-label={`${typLabel} löschen`}
          title={`${typLabel} löschen`}
          onClick={() => setOffen(true)}
        >
          <Trash2 size={15} />
        </button>
      ) : (
        <button className={className ?? "btn btn-ghost slim"} onClick={() => setOffen(true)}>
          <Trash2 size={15} /> {label}
        </button>
      )}
      {offen && (
        <LoeschDialog
          art={art}
          id={id}
          name={name}
          typLabel={typLabel}
          deaktivierenLabel={deaktivierenLabel}
          onClose={() => setOffen(false)}
          onDone={onDone}
        />
      )}
    </>
  );
}
