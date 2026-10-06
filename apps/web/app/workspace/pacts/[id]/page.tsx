import { PactDetail } from '../../../../components/pact-detail';
export const metadata = { title: 'Shared Pact record' };
export default async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PactDetail id={id} />;
}
