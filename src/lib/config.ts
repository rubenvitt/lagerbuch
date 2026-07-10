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
  authSecret: string;
  oidcIssuer: string;
  oidcClientId: string;
  oidcClientSecret: string;
  oidcAdminGroup: string;
  authDevLogin: boolean;
  nodeEnv: string;
}

const boolEnv = z
  .enum(["true", "false"])
  .default("false")
  .transform((v) => v === "true");

const BaseEnvSchema = z.object({
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
  NODE_ENV: z.string().default("development"),
  AUTH_SECRET: z.string().default("dev-insecure-secret-change-me"),
  OIDC_ISSUER: z.string().default(""),
  OIDC_CLIENT_ID: z.string().default(""),
  OIDC_CLIENT_SECRET: z.string().default(""),
  OIDC_ADMIN_GROUP: z.string().default("lagerbuch-admin"),
  AUTH_DEV_LOGIN: boolEnv,
});

const EnvSchema = BaseEnvSchema.superRefine((e, ctx) => {
  if (e.AUTH_DEV_LOGIN && e.NODE_ENV === "production") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["AUTH_DEV_LOGIN"],
      message: "AUTH_DEV_LOGIN darf in production nicht aktiv sein",
    });
  }
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
    authSecret: e.AUTH_SECRET,
    oidcIssuer: e.OIDC_ISSUER,
    oidcClientId: e.OIDC_CLIENT_ID,
    oidcClientSecret: e.OIDC_CLIENT_SECRET,
    oidcAdminGroup: e.OIDC_ADMIN_GROUP,
    authDevLogin: e.AUTH_DEV_LOGIN,
    nodeEnv: e.NODE_ENV,
  };
}

export const config = parseConfig(process.env);

/**
 * Runtime-only guard against a forgeable-admin deploy: AUTH_SECRET signs the
 * JWT carrying `isAdmin`, and its dev default is public (this repo is
 * public), so production must never run with it unset or left at the
 * default. This is intentionally NOT part of parseConfig/EnvSchema: `next
 * build` runs with NODE_ENV=production and no AUTH_SECRET set, and the
 * `config` singleton above is evaluated at build time, so throwing here
 * during parseConfig would break `pnpm build`. Call this at server startup
 * instead (see src/instrumentation.ts).
 */
export function assertProductionSecrets(cfg: AppConfig): void {
  const insecure = "dev-insecure-secret-change-me";
  if (cfg.nodeEnv === "production" && (!cfg.authSecret || cfg.authSecret === insecure)) {
    throw new Error(
      "AUTH_SECRET muss in Produktion gesetzt sein (nicht der Dev-Default). Siehe generate-secrets.sh / stack.env.",
    );
  }
}
