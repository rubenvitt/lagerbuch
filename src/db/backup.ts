import { existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { getSqlite } from "@/db";
import { config } from "@/lib/config";

function pad2(n: number): string { return String(n).padStart(2, "0"); }

export function backupDateiname(now: Date): string {
  return `lagerbuch-${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}.db`;
}

// Backup-Dateinamen selektieren, die aelter als retentionTage sind (Fremdnamen ignoriert).
export function veralteteBackups(dateien: string[], now: Date, retentionTage: number): string[] {
  const grenze = now.getTime() - retentionTage * 86_400_000;
  return dateien.filter((f) => {
    const m = /^lagerbuch-(\d{4})(\d{2})(\d{2})\.db$/.exec(f);
    if (!m) return false;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() < grenze;
  });
}

async function snapshot(now: Date): Promise<void> {
  const backupDir = join(dirname(config.databasePath), "backups");
  mkdirSync(backupDir, { recursive: true });
  const ziel = join(backupDir, backupDateiname(now));
  if (existsSync(ziel)) return; // heute schon gesichert
  await getSqlite().backup(ziel);
  for (const alt of veralteteBackups(readdirSync(backupDir), now, 14)) {
    try { unlinkSync(join(backupDir, alt)); } catch { /* ignore */ }
  }
}

// Guardrail: darf den Startup NIEMALS brechen. Stuendlicher idempotenter Tick;
// Snapshot nur wenn Stunde==2 und heute noch keine Datei. Aufrufer ruft nur in Produktion.
export function starteBackupJob(): void {
  try {
    const tick = () => {
      const now = new Date();
      if (now.getHours() === 2) snapshot(now).catch((e) => console.error("[backup] snapshot:", e));
    };
    const iv = setInterval(tick, 60 * 60 * 1000);
    iv.unref?.();
    tick();
  } catch (e) {
    console.error("[backup] start:", e);
  }
}
