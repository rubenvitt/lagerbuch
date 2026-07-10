import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export function GET() {
  const name = config.appOrg
    ? `${config.appName} · ${config.appOrg}`
    : config.appName;

  const manifest = {
    name,
    short_name: config.appName,
    description: config.appTagline,
    start_url: "/",
    display: "standalone",
    background_color: "#EEF0F1",
    theme_color: "#C8000F",
    icons: [] as unknown[],
  };

  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json" },
  });
}
