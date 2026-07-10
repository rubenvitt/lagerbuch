export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { applyMigrations, getDb } = await import("@/db");
    applyMigrations(getDb());
  }
}
