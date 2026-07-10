export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { applyMigrations, getDb } = await import("@/db");
    const { config, assertProductionSecrets } = await import("@/lib/config");
    const { ensureHandlager } = await import("@/db/seed-handlager");
    assertProductionSecrets(config);
    applyMigrations(getDb());
    ensureHandlager(getDb());
  }
}
