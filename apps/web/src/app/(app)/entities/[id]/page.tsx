import { notFound } from "next/navigation";

import { EntityDetail } from "@/components/intel/entity-detail";
import { Window } from "@/components/os/window";
import { requireActiveSubscription } from "@/lib/auth";
import { getEntityDetail } from "@/lib/intel";

export default async function EntityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireActiveSubscription();
  const { id } = await params;
  const detail = await getEntityDetail(session.organizationId, id);
  if (!detail) notFound();

  return (
    <Window title={detail.name} meta={detail.tier} closeHref="/entities" size="xl">
      <EntityDetail detail={detail} />
    </Window>
  );
}
