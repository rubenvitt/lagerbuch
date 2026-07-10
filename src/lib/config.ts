import { z } from "zod";

export interface AppConfig {
  appName: string;
  appOrg: string;
  appTagline: string;
  appBaseUrl: string;
  databasePath: string;
  tz: string;
  warnTageKritisch: number;
  warnTageFaellig: number;
  bestellFaktor: number;
  helferSessionStunden: number;
}

const EnvSchema = z.object({
  APP_NAME: z.string().default("Lagerbuch"),
  APP_ORG: z.string().default(""),
  APP_TAGLINE: z.string().default("Materialverwaltung"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_PATH: z.string().default("/data/lagerbuch.db"),
  TZ: z.string().default("Europe/Berlin"),
  WARN_TAGE_KRITISCH: z.coerce.number().int().positive().default(31),
  WARN_TAGE_FAELLIG: z.coerce.number().int().positive().default(56),
  BESTELL_FAKTOR: z.coerce.number().positive().default(2),
  HELFER_SESSION_STUNDEN: z.coerce.number().int().positive().default(12),
});

export function parseConfig(env: NodeJS.ProcessEnv): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = JSON.stringify(parsed.error.flatten().fieldErrors);
    throw new Error(`Ungültige Umgebungskonfiguration: ${issues}`);
  }
  const e = parsed.data;
  return {
    appName: e.APP_NAME,
    appOrg: e.APP_ORG,
    appTagline: e.APP_TAGLINE,
    appBaseUrl: e.APP_BASE_URL,
    databasePath: e.DATABASE_PATH,
    tz: e.TZ,
    warnTageKritisch: e.WARN_TAGE_KRITISCH,
    warnTageFaellig: e.WARN_TAGE_FAELLIG,
    bestellFaktor: e.BESTELL_FAKTOR,
    helferSessionStunden: e.HELFER_SESSION_STUNDEN,
  };
}

export const config = parseConfig(process.env);
