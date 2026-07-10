import { Gate } from "@/components/Gate";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export default function GatePage() {
  return (
    <Gate
      branding={{
        appOrg: config.appOrg,
        appTagline: config.appTagline,
      }}
    />
  );
}
