import { notFound } from "next/navigation";

import { EntityDetail } from "@/components/intel/entity-detail";
import { WindowOverlay } from "@/components/os/window-overlay";
import { requireActiveSubscription } from "@/lib/auth";
import { getEntityDetail } from "@/lib/intel";

/** Intercepted entity detail: soft navigation from the entities list opens a
 * floating window; direct URL or refresh falls through to the full page. */
export default async function EntityDetailOverlay({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireActiveSubscription();
  const { id } = await params;
  const detail = await getEntityDetail(session.organizationId, id);
  if (!detail) notFound();

  return (
    <WindowOverlay title={detail.name} meta={detail.tier}>
      <EntityDetail detail={detail} />
    </WindowOverlay>
  );
}
