import { Shell } from '../../../components/shell';
import { ServiceDetail } from '../../../components/marketplace';
export default async function ServicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Shell>
      <ServiceDetail id={id} />
    </Shell>
  );
}
