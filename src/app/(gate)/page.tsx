import { Gate } from "@/components/Gate";
import { config } from "@/lib/config";
import { sanitizeReturnTo } from "@/lib/auth/returnTo";

export const dynamic = "force-dynamic";

export default async function GatePage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const { returnTo } = await searchParams;
  return (
    <Gate
      branding={{ appOrg: config.appOrg, appTagline: config.appTagline }}
      oidcEnabled={Boolean(config.oidcIssuer)}
      devLoginEnabled={config.authDevLogin && config.nodeEnv !== "production"}
      returnTo={sanitizeReturnTo(returnTo) ?? ""}
    />
  );
}
