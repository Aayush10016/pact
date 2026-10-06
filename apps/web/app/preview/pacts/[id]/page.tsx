import { notFound } from 'next/navigation';
import { demoPacts } from '@pact/shared';
import { PactDetail } from '../../../../components/preview/pact-detail';
export default async function PreviewDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pact = demoPacts.find((p) => p.id === id);
  if (!pact) notFound();
  return <PactDetail pact={pact} />;
}
