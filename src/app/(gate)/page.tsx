import { Gate } from "@/components/Gate";
import { config } from "@/lib/config";

export default function GatePage() {
  return (
    <Gate
      branding={{
        appName: config.appName,
        appOrg: config.appOrg,
        appTagline: config.appTagline,
      }}
    />
  );
}
