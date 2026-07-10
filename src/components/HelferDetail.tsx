import { HelferFrame } from "@/components/HelferFrame";
import { HelferEntnahme, type DetailData } from "@/components/HelferEntnahme";

export function HelferDetail({ detail, tokenLabel }: { detail: DetailData; tokenLabel: string }) {
  return (
    <HelferFrame tokenLabel={tokenLabel}>
      <HelferEntnahme detail={detail} />
    </HelferFrame>
  );
}
