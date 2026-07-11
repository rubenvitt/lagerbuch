import type { ReactNode } from "react";
import { Plakette } from "@/components/Plakette";
import { chipTone } from "@/lib/format";
import type { Ampel } from "@/lib/domain/verfall";

export type VerfallEintragView = {
  chargeId: string; chargenNr: string; verfall: string; rest: number;
  ampel: Ampel; abgelaufen: boolean; text: string;
  artikelId: string; artikelName: string; einheit: string; fach: string;
};

export function VerfallItem({ eintrag, action }: { eintrag: VerfallEintragView; action?: ReactNode }) {
  return (
    <div className="row">
      <Plakette verfall={eintrag.verfall} ampel={eintrag.ampel} />
      <div className="rowmain">
        <div className="rowname">{eintrag.artikelName}</div>
        <div className="rowmeta">
          <span className="fach">{eintrag.fach}</span>
          <span style={{ font: "600 12px var(--mono)" }}>Charge {eintrag.chargenNr}</span>
          <span className={`chip chip-${chipTone(eintrag.ampel)}`}>{eintrag.text}</span>
        </div>
      </div>
      <div className="bignum" style={{ fontSize: 20 }}>
        {eintrag.rest}
        <small>{eintrag.einheit}</small>
      </div>
      {action}
    </div>
  );
}
